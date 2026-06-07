// ==UserScript==
// @name         ChatGPT Thinking Effort Hotkeys
// @namespace    https://github.com/evanlouie/userscripts
// @version      0.2.1
// @description  Cycle ChatGPT Instant and Thinking reasoning efforts.
// @author       Evan Louie
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @homepageURL  https://github.com/evanlouie/userscripts
// @supportURL   https://github.com/evanlouie/userscripts/issues
// @updateURL    https://raw.githubusercontent.com/evanlouie/userscripts/master/userscripts/chatgpt-thinking-effort-hotkeys.user.js
// @downloadURL  https://raw.githubusercontent.com/evanlouie/userscripts/master/userscripts/chatgpt-thinking-effort-hotkeys.user.js
// ==/UserScript==

// @ts-check

(function () {
  "use strict";

  /**
   * @typedef {"Instant" | "Thinking" | "Pro"} MenuModeLabel
   * @typedef {"Instant" | "Thinking"} CycleModeLabel
   * @typedef {"Thinking"} ReasoningModeLabel
   * @typedef {{ code: string, key: string, direction: 1 | -1 }} Hotkey
   * @typedef {{ element: HTMLElement, mode: MenuModeLabel, effortLabel: string, checked: boolean }} ModeItem
   * @typedef {{ element: HTMLElement, label: string, checked: boolean }} EffortOption
   * @typedef {{ kind: "instant", mode: "Instant", item: ModeItem }} InstantCycleOption
   * @typedef {{ kind: "effort", mode: ReasoningModeLabel, item: ModeItem, effort: EffortOption }} EffortCycleOption
   * @typedef {InstantCycleOption | EffortCycleOption} CycleOption
   * @typedef {{ clientX: number, clientY: number }} PointerPoint
   * @typedef {HTMLElement & { __thinkingEffortHotkeysTimer?: number }} ToastElement
   */

  /** @type {Hotkey[]} */
  const HOTKEYS = [
    { code: "BracketRight", key: "]", direction: 1 },
    { code: "BracketLeft", key: "[", direction: -1 },
  ];

  const MENU_MODE_LABELS = /** @type {MenuModeLabel[]} */ (["Instant", "Thinking", "Pro"]);
  const CYCLE_MODE_LABELS = /** @type {CycleModeLabel[]} */ (["Instant", "Thinking"]);
  const KNOWN_EFFORTS = ["Light", "Standard", "Extended", "Heavy"];
  const MENU_WAIT_MS = 1200;
  const SUBMENU_WAIT_MS = 900;
  const TOAST_MS = 1600;
  const TOAST_ID = "chatgpt-thinking-effort-hotkeys-toast";

  let cycling = false;

  document.addEventListener("keydown", onKeyDown, true);

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    const hotkey = HOTKEYS.find((candidate) => matchesHotkey(event, candidate));
    if (!hotkey) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (cycling) return;
    cycling = true;

    cycleModelMode(hotkey.direction)
      .catch((error) => {
        closeMenus();
        toast(error && error.message ? error.message : "ChatGPT mode hotkey failed");
      })
      .finally(() => {
        cycling = false;
      });
  }

  /**
   * @param {KeyboardEvent} event
   * @param {Hotkey} hotkey
   */
  function matchesHotkey(event, hotkey) {
    if (event.repeat || event.isComposing) return false;
    if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey) return false;
    return event.code === hotkey.code || event.key === hotkey.key;
  }

  /** @param {1 | -1} direction */
  async function cycleModelMode(direction) {
    const activeElement =
      document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    const focusTarget = getPromptFocusTarget() || activeElement;
    const trigger = findComposerModeButton();
    if (!trigger) {
      throw new Error("ChatGPT mode button not found");
    }

    let modeItems = findModeMenuItems();
    if (!modeItems.length) {
      clickElement(trigger);
      modeItems = await waitFor(
        () => {
          const items = findModeMenuItems();
          return items.length ? items : null;
        },
        MENU_WAIT_MS,
        "ChatGPT mode menu not found",
      );
    }

    const options = await getCycleOptions(modeItems);
    if (options.length < 2) {
      throw new Error("ChatGPT mode options not found");
    }

    const currentIndex = getCurrentCycleOptionIndex(options, modeItems, trigger);
    const targetIndex = wrapIndex(currentIndex + direction, options.length);
    const target = options[targetIndex];

    await selectCycleOption(target);
    restoreFocus(focusTarget);
    toast(`ChatGPT mode: ${formatCycleOption(target)}`);
  }

  /** @returns {HTMLElement | null} */
  function findComposerModeButton() {
    const composerRoot = findComposerRoot();
    const roots = composerRoot ? [composerRoot, document] : [document];

    for (const root of roots) {
      const buttons = visibleElements(
        root.querySelectorAll(
          'button[aria-haspopup="menu"], button, [role="button"][aria-haspopup="menu"]',
        ),
      );

      const exactMatch = buttons.find((button) => isComposerModeTriggerText(normalizeText(button)));
      if (exactMatch) return exactMatch;

      const menuButton = buttons.find((button) => {
        const text = normalizeText(button);
        return isComposerModeTriggerText(text);
      });
      if (menuButton) return menuButton;
    }

    return null;
  }

  /** @returns {HTMLElement | null} */
  function findComposerRoot() {
    const prompt = getPromptFocusTarget();
    if (!prompt) return null;

    let node = prompt.parentElement;
    while (node && node !== document.body) {
      const buttons = visibleElements(node.querySelectorAll("button"));
      if (buttons.some((button) => isComposerModeTriggerText(normalizeText(button)))) {
        return node;
      }
      node = node.parentElement;
    }

    return prompt.parentElement;
  }

  /** @returns {HTMLElement | null} */
  function getPromptFocusTarget() {
    const target =
      document.querySelector('[contenteditable="true"][aria-label*="ChatGPT" i]') ||
      document.querySelector('[role="textbox"][aria-label*="ChatGPT" i]') ||
      document.querySelector("textarea[placeholder], textarea[aria-label]");

    return target instanceof HTMLElement ? target : null;
  }

  /** @returns {ModeItem[]} */
  function findModeMenuItems() {
    const candidates = visibleElements(
      document.querySelectorAll(
        '[role="menuitemradio"], [role="option"], [role="radio"], [aria-checked]',
      ),
    );

    const items = [];
    const seenModes = new Set();

    for (const element of candidates) {
      const text = normalizeText(element);
      const mode = menuModeLabelFromText(text);
      if (!mode || seenModes.has(mode)) continue;

      const menu = element.closest('[role="menu"]');
      if (!(menu instanceof HTMLElement) || !isModelMenu(menu)) continue;

      seenModes.add(mode);
      items.push({
        element,
        mode,
        effortLabel: effortLabelFromText(text),
        checked: isChecked(element),
      });
    }

    return items.sort((a, b) => {
      const aRect = a.element.getBoundingClientRect();
      const bRect = b.element.getBoundingClientRect();
      return aRect.top - bRect.top || aRect.left - bRect.left;
    });
  }

  /** @param {ModeItem} modeItem */
  async function getOrOpenEffortOptions(modeItem) {
    let options = getEffortOptions(modeItem);
    if (!options) {
      openEffortSubmenu(modeItem);
      options = await waitFor(
        () => getEffortOptions(modeItem),
        SUBMENU_WAIT_MS,
        `${modeItem.mode} effort submenu not found`,
      );
    }

    return options;
  }

  /** @param {ModeItem} modeItem */
  function openEffortSubmenu(modeItem) {
    const action = findEffortAction(modeItem.element);
    if (action) {
      clickElement(action);
      return;
    }

    revealSubmenu(modeItem.element);
  }

  /**
   * @param {HTMLElement} modeElement
   * @returns {HTMLElement | null}
   */
  function findEffortAction(modeElement) {
    const row =
      modeElement.closest("[data-model-picker-thinking-effort-row]") ||
      modeElement.parentElement ||
      modeElement;

    return (
      toHTMLElement(
        row.querySelector(
          '[data-model-picker-thinking-effort-action="true"][aria-haspopup="menu"]',
        ),
      ) ||
      toHTMLElement(row.querySelector('[data-testid$="-thinking-effort"][aria-haspopup="menu"]')) ||
      toHTMLElement(row.querySelector('button[aria-label="Effort"][aria-haspopup="menu"]'))
    );
  }

  /** @param {HTMLElement} element */
  function revealSubmenu(element) {
    if (typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }

    const rect = element.getBoundingClientRect();
    const point = {
      clientX: rect.left + Math.min(rect.width - 8, Math.max(8, rect.width * 0.82)),
      clientY: rect.top + rect.height / 2,
    };

    dispatchPointerEvent(element, "pointerover", point);
    dispatchPointerEvent(element, "pointerenter", point);
    dispatchPointerEvent(element, "pointermove", point);
    dispatchMouseEvent(element, "mouseover", point);
    dispatchMouseEvent(element, "mouseenter", point);
    dispatchMouseEvent(element, "mousemove", point);
  }

  /**
   * @param {ModeItem} modeItem
   * @returns {EffortOption[] | null}
   */
  function getEffortOptions(modeItem) {
    const submenu = findEffortSubmenu(modeItem.element, findEffortAction(modeItem.element));
    if (!submenu) return null;

    const rawItems = visibleElements(
      submenu.querySelectorAll(
        '[role="menuitemradio"], [role="menuitem"], [role="option"], [role="radio"], button, [aria-checked]',
      ),
    );

    const options = [];
    const seen = new Set();

    for (const element of rawItems) {
      const label = effortLabelFromText(normalizeText(element));
      if (!label || seen.has(label)) continue;

      seen.add(label);
      options.push({
        element,
        label,
        checked: isChecked(element),
      });
    }

    return options.length ? options : null;
  }

  /**
   * @param {HTMLElement} modeElement
   * @param {HTMLElement | null} action
   * @returns {HTMLElement | null}
   */
  function findEffortSubmenu(modeElement, action) {
    const menus = visibleElements(document.querySelectorAll('[role="menu"]'));

    if (action) {
      const controls = action.getAttribute("aria-controls");
      const controlled = controls ? toHTMLElement(document.getElementById(controls)) : null;
      if (controlled && isVisible(controlled) && controlled.getAttribute("role") === "menu") {
        return controlled;
      }

      const actionId = action.id;
      const labelledMenu = actionId
        ? menus.find((menu) => menu.getAttribute("aria-labelledby") === actionId)
        : null;
      if (labelledMenu) return labelledMenu;
    }

    const modeRect = modeElement.getBoundingClientRect();
    const candidates = menus
      .filter((menu) => !menu.contains(modeElement))
      .map((menu) => ({ menu, rect: menu.getBoundingClientRect(), text: normalizeText(menu) }))
      .filter(({ rect, text }) => {
        const hasLevels =
          KNOWN_EFFORTS.filter((label) => new RegExp(`\\b${label}\\b`).test(text)).length >= 1;
        const looksLikeSubmenu =
          rect.left >= modeRect.right - 16 && rect.top < modeRect.bottom + 20;
        return (
          hasLevels &&
          looksLikeSubmenu &&
          !/\bInstant\b|\bThinking\b|\bPro\b|\bConfigure\b/.test(text)
        );
      })
      .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);

    return candidates.length ? candidates[0].menu : null;
  }

  /**
   * @param {ModeItem[]} modeItems
   * @returns {Promise<CycleOption[]>}
   */
  async function getCycleOptions(modeItems) {
    /** @type {CycleOption[]} */
    const options = [];

    for (const item of modeItems) {
      if (item.mode === "Instant") {
        options.push({ kind: "instant", mode: "Instant", item });
        continue;
      }
      if (item.mode !== "Thinking") continue;

      const efforts = await getOrOpenEffortOptions(item);
      for (const effort of efforts) {
        options.push({
          kind: "effort",
          mode: /** @type {ReasoningModeLabel} */ (item.mode),
          item,
          effort,
        });
      }
    }

    return options;
  }

  /**
   * @param {CycleOption[]} options
   * @param {ModeItem[]} modeItems
   * @param {HTMLElement} trigger
   */
  function getCurrentCycleOptionIndex(options, modeItems, trigger) {
    const checkedIndex = options.findIndex((option) => {
      if (option.kind === "instant") return option.item.checked;
      return option.item.checked && option.effort.checked;
    });
    if (checkedIndex >= 0) return checkedIndex;

    const checkedMode = modeItems.find((item) => item.checked);
    if (checkedMode && isCycleMode(checkedMode.mode)) {
      const checkedModeIndex = findCycleOptionIndexForMode(
        options,
        checkedMode.mode,
        checkedMode.effortLabel || effortLabelFromText(normalizeText(trigger)),
      );
      if (checkedModeIndex >= 0) return checkedModeIndex;
    }

    const triggerText = normalizeText(trigger);
    const triggerMode = menuModeLabelFromText(triggerText);
    if (triggerMode && isCycleMode(triggerMode)) {
      const triggerModeIndex = findCycleOptionIndexForMode(
        options,
        triggerMode,
        effortLabelFromText(triggerText),
      );
      if (triggerModeIndex >= 0) return triggerModeIndex;
    }

    const triggerEffort =
      !triggerMode || triggerMode === "Thinking" ? effortLabelFromText(triggerText) : "";
    if (triggerEffort) {
      const effortIndex = options.findIndex(
        (option) => option.kind === "effort" && option.effort.label === triggerEffort,
      );
      if (effortIndex >= 0) return effortIndex;
    }

    return 0;
  }

  /**
   * @param {CycleOption[]} options
   * @param {CycleModeLabel} mode
   * @param {string} effortLabel
   */
  function findCycleOptionIndexForMode(options, mode, effortLabel) {
    if (mode === "Instant") {
      return options.findIndex((option) => option.kind === "instant");
    }

    const effortIndex = options.findIndex(
      (option) =>
        option.kind === "effort" && option.mode === mode && option.effort.label === effortLabel,
    );
    if (effortIndex >= 0) return effortIndex;

    return options.findIndex((option) => option.kind === "effort" && option.mode === mode);
  }

  /** @param {CycleOption} option */
  async function selectCycleOption(option) {
    if (option.kind === "instant") {
      clickElement(option.item.element);
      return;
    }

    let target = option.effort.element;
    if (!document.contains(target) || !isVisible(target)) {
      const refreshedOptions = await getOrOpenEffortOptions(option.item);
      const refreshedTarget = refreshedOptions.find(
        (effort) => effort.label === option.effort.label,
      );
      if (!refreshedTarget) {
        throw new Error(`${formatCycleOption(option)} not found`);
      }
      target = refreshedTarget.element;
    }

    clickElement(target);
  }

  /** @param {CycleOption} option */
  function formatCycleOption(option) {
    return option.kind === "instant" ? "Instant" : `${option.mode} • ${option.effort.label}`;
  }

  /** @param {HTMLElement} menu */
  function isModelMenu(menu) {
    const text = normalizeText(menu);
    return CYCLE_MODE_LABELS.every((label) => new RegExp(`\\b${label}\\b`).test(text));
  }

  /** @param {string} text */
  function isComposerModeTriggerText(text) {
    if (!text || /Configure|profile menu|Download apps/i.test(text)) return false;

    const modePattern = MENU_MODE_LABELS.join("|");
    const effortPattern = KNOWN_EFFORTS.join("|");
    return new RegExp(
      `^(?:${modePattern})(?:\\s*(?:•|-|:)\\s*(?:${effortPattern}))?$|^(?:${effortPattern})$`,
    ).test(text);
  }

  /**
   * @param {string} text
   * @returns {MenuModeLabel | null}
   */
  function menuModeLabelFromText(text) {
    for (const label of MENU_MODE_LABELS) {
      if (new RegExp(`^${label}(?:\\b|$)`).test(text)) {
        return label;
      }
    }

    return null;
  }

  /**
   * @param {MenuModeLabel} mode
   * @returns {mode is CycleModeLabel}
   */
  function isCycleMode(mode) {
    return mode === "Instant" || mode === "Thinking";
  }

  /** @param {Element} element */
  function isChecked(element) {
    return (
      element.getAttribute("aria-checked") === "true" ||
      element.getAttribute("aria-selected") === "true" ||
      element.getAttribute("data-state") === "checked"
    );
  }

  /** @param {string} text */
  function effortLabelFromText(text) {
    for (const label of KNOWN_EFFORTS) {
      if (new RegExp(`(?:^|\\b)${label}(?:\\b|$)`).test(text)) {
        return label;
      }
    }

    if (
      /^[A-Z][A-Za-z0-9 +.-]{1,24}$/.test(text) &&
      !/Instant|Thinking|Configure|Latest|Model|Effort|Pro/.test(text)
    ) {
      return text;
    }

    return "";
  }

  /** @param {HTMLElement} element */
  function clickElement(element) {
    const rect = element.getBoundingClientRect();
    const point = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };

    dispatchPointerEvent(element, "pointerdown", point);
    dispatchMouseEvent(element, "mousedown", point);
    dispatchPointerEvent(element, "pointerup", point);
    dispatchMouseEvent(element, "mouseup", point);
    element.click();
  }

  /**
   * @param {HTMLElement} element
   * @param {string} type
   * @param {PointerPoint} point
   */
  function dispatchPointerEvent(element, type, point) {
    if (!window.PointerEvent) return;

    element.dispatchEvent(
      new PointerEvent(type, {
        bubbles: type !== "pointerenter",
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        view: window,
        ...point,
      }),
    );
  }

  /**
   * @param {HTMLElement} element
   * @param {string} type
   * @param {PointerPoint} point
   */
  function dispatchMouseEvent(element, type, point) {
    element.dispatchEvent(
      new MouseEvent(type, {
        bubbles: type !== "mouseenter",
        cancelable: true,
        view: window,
        ...point,
      }),
    );
  }

  /**
   * @param {Iterable<Element>} elements
   * @returns {HTMLElement[]}
   */
  function visibleElements(elements) {
    return /** @type {HTMLElement[]} */ (
      Array.from(elements).filter((element) => element instanceof HTMLElement && isVisible(element))
    );
  }

  /** @param {Element} element */
  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
    );
  }

  /** @param {string | Element} elementOrText */
  function normalizeText(elementOrText) {
    const text =
      typeof elementOrText === "string"
        ? elementOrText
        : elementOrText instanceof HTMLElement
          ? elementOrText.innerText ||
            elementOrText.textContent ||
            elementOrText.getAttribute("aria-label") ||
            ""
          : elementOrText.textContent || elementOrText.getAttribute("aria-label") || "";

    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * @param {number} index
   * @param {number} length
   */
  function wrapIndex(index, length) {
    return ((index % length) + length) % length;
  }

  /**
   * @template T
   * @param {() => T | null | undefined | false} getValue
   * @param {number} timeoutMs
   * @param {string} [message]
   * @returns {Promise<T>}
   */
  function waitFor(getValue, timeoutMs, message = "Expected ChatGPT menu not found") {
    const startedAt = performance.now();

    return new Promise((resolve, reject) => {
      const tick = () => {
        const value = getValue();
        if (value) {
          resolve(value);
          return;
        }

        if (performance.now() - startedAt >= timeoutMs) {
          reject(new Error(message));
          return;
        }

        requestAnimationFrame(tick);
      };

      tick();
    });
  }

  /** @param {HTMLElement | SVGElement | null} target */
  function restoreFocus(target) {
    if (!target || typeof target.focus !== "function" || !document.contains(target)) return;

    requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
    });
  }

  function closeMenus() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  /** @param {string} message */
  function toast(message) {
    /** @type {ToastElement | null} */
    let element = toToastElement(document.getElementById(TOAST_ID));
    if (!element) {
      element = /** @type {ToastElement} */ (document.createElement("div"));
      element.id = TOAST_ID;
      element.setAttribute("role", "status");
      Object.assign(element.style, {
        position: "fixed",
        right: "18px",
        bottom: "18px",
        zIndex: "2147483647",
        maxWidth: "320px",
        padding: "9px 12px",
        borderRadius: "8px",
        background: "rgba(20, 20, 20, 0.92)",
        color: "white",
        font: "13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.22)",
        opacity: "0",
        transform: "translateY(6px)",
        transition: "opacity 120ms ease, transform 120ms ease",
        pointerEvents: "none",
      });
      document.documentElement.appendChild(element);
    }

    element.textContent = message;
    element.style.opacity = "1";
    element.style.transform = "translateY(0)";

    window.clearTimeout(element.__thinkingEffortHotkeysTimer);
    element.__thinkingEffortHotkeysTimer = window.setTimeout(() => {
      element.style.opacity = "0";
      element.style.transform = "translateY(6px)";
    }, TOAST_MS);
  }

  /**
   * @param {Element | null} element
   * @returns {HTMLElement | null}
   */
  function toHTMLElement(element) {
    return element instanceof HTMLElement ? element : null;
  }

  /**
   * @param {Element | null} element
   * @returns {ToastElement | null}
   */
  function toToastElement(element) {
    return element instanceof HTMLElement ? /** @type {ToastElement} */ (element) : null;
  }
})();
