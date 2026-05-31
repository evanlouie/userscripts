// ==UserScript==
// @name         ChatGPT Thinking Effort Hotkeys
// @namespace    https://github.com/evanlouie/userscripts
// @version      0.1.2
// @description  Cycle ChatGPT thinking effort from the model submenu.
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
   * @typedef {{ code: string, key: string, direction: 1 | -1 }} Hotkey
   * @typedef {{ element: HTMLElement, label: string, checked: boolean }} EffortOption
   * @typedef {{ clientX: number, clientY: number }} PointerPoint
   * @typedef {HTMLElement & { __thinkingEffortHotkeysTimer?: number }} ToastElement
   */

  /** @type {Hotkey[]} */
  const HOTKEYS = [
    { code: "BracketRight", key: "]", direction: 1 },
    { code: "BracketLeft", key: "[", direction: -1 },
  ];

  const KNOWN_EFFORTS = ["Light", "Standard", "Extended", "Heavy"];
  const COMPOSER_TRIGGER_LABELS = ["Thinking", ...KNOWN_EFFORTS];
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

    cycleThinkingEffort(hotkey.direction)
      .catch((error) => {
        closeMenus();
        toast(error && error.message ? error.message : "Thinking effort hotkey failed");
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
  async function cycleThinkingEffort(direction) {
    const activeElement =
      document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement
        ? document.activeElement
        : null;
    const focusTarget = getPromptFocusTarget() || activeElement;
    const trigger = findComposerEffortButton();
    if (!trigger) {
      throw new Error("Thinking effort button not found");
    }

    let thinkingItem = findThinkingMenuItem();
    if (!thinkingItem) {
      clickElement(trigger);
      thinkingItem = await waitFor(findThinkingMenuItem, MENU_WAIT_MS);
    }

    let options = getEffortOptions(thinkingItem);
    if (!options) {
      openEffortSubmenu(thinkingItem);
      options = await waitFor(() => getEffortOptions(thinkingItem), SUBMENU_WAIT_MS);
    }

    if (options.length < 2) {
      throw new Error("Thinking effort submenu not found");
    }

    const currentIndex = getCurrentOptionIndex(options, thinkingItem, trigger);
    const targetIndex = wrapIndex(currentIndex + direction, options.length);
    const target = options[targetIndex];

    clickElement(target.element);
    restoreFocus(focusTarget);
    toast(`Thinking effort: ${target.label}`);
  }

  /** @returns {HTMLElement | null} */
  function findComposerEffortButton() {
    const composerRoot = findComposerRoot();
    const roots = composerRoot ? [composerRoot, document] : [document];

    for (const root of roots) {
      const buttons = visibleElements(
        root.querySelectorAll(
          'button[aria-haspopup="menu"], button, [role="button"][aria-haspopup="menu"]',
        ),
      );

      const exactMatch = buttons.find((button) =>
        COMPOSER_TRIGGER_LABELS.includes(normalizeText(button)),
      );
      if (exactMatch) return exactMatch;

      const menuButton = buttons.find((button) => {
        const text = normalizeText(button);
        return (
          /\b(Thinking|Light|Standard|Extended|Heavy)\b/.test(text) &&
          !/Configure|Instant|Pro/.test(text)
        );
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
      if (buttons.some((button) => COMPOSER_TRIGGER_LABELS.includes(normalizeText(button)))) {
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

  /** @returns {HTMLElement | undefined} */
  function findThinkingMenuItem() {
    const candidates = visibleElements(
      document.querySelectorAll(
        '[role="menuitemradio"], [role="menuitem"], [role="option"], [role="radio"], [aria-checked]',
      ),
    );

    return candidates.find((element) => {
      const text = normalizeText(element);
      if (!/^Thinking\b/.test(text)) return false;

      const menu = element.closest('[role="menu"]');
      const menuText = menu ? normalizeText(menu) : "";
      return /\bInstant\b/.test(menuText) && /\bPro\b/.test(menuText);
    });
  }

  /** @param {HTMLElement} thinkingItem */
  function openEffortSubmenu(thinkingItem) {
    const action = findThinkingEffortAction(thinkingItem);
    if (action) {
      clickElement(action);
      return;
    }

    revealSubmenu(thinkingItem);
  }

  /**
   * @param {HTMLElement} thinkingItem
   * @returns {HTMLElement | null}
   */
  function findThinkingEffortAction(thinkingItem) {
    const row =
      thinkingItem.closest("[data-model-picker-thinking-effort-row]") ||
      thinkingItem.parentElement ||
      thinkingItem;

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
   * @param {HTMLElement} thinkingItem
   * @returns {EffortOption[] | null}
   */
  function getEffortOptions(thinkingItem) {
    const submenu = findEffortSubmenu(thinkingItem);
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
        checked:
          element.getAttribute("aria-checked") === "true" ||
          element.getAttribute("aria-selected") === "true",
      });
    }

    return options.length ? options : null;
  }

  /**
   * @param {HTMLElement} thinkingItem
   * @returns {HTMLElement | null}
   */
  function findEffortSubmenu(thinkingItem) {
    const thinkingRect = thinkingItem.getBoundingClientRect();
    const menus = visibleElements(document.querySelectorAll('[role="menu"]'));

    const candidates = menus
      .filter((menu) => !menu.contains(thinkingItem))
      .map((menu) => ({ menu, rect: menu.getBoundingClientRect(), text: normalizeText(menu) }))
      .filter(({ rect, text }) => {
        const hasLevels =
          KNOWN_EFFORTS.filter((label) => new RegExp(`\\b${label}\\b`).test(text)).length >= 2;
        const looksLikeSubmenu =
          rect.left >= thinkingRect.right - 16 && rect.top < thinkingRect.bottom + 20;
        return hasLevels && looksLikeSubmenu && !/\bInstant\b|\bConfigure\b|\bPro\b/.test(text);
      })
      .sort((a, b) => a.rect.left - b.rect.left || a.rect.top - b.rect.top);

    return candidates.length ? candidates[0].menu : null;
  }

  /**
   * @param {EffortOption[]} options
   * @param {HTMLElement} thinkingItem
   * @param {HTMLElement} trigger
   */
  function getCurrentOptionIndex(options, thinkingItem, trigger) {
    const checkedIndex = options.findIndex((option) => option.checked);
    if (checkedIndex >= 0) return checkedIndex;

    const fallbackText = `${normalizeText(thinkingItem)} ${normalizeText(trigger)}`;
    const fallbackLabel = effortLabelFromText(fallbackText);
    const fallbackIndex = options.findIndex((option) => option.label === fallbackLabel);
    return fallbackIndex >= 0 ? fallbackIndex : 0;
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
   * @returns {Promise<T>}
   */
  function waitFor(getValue, timeoutMs) {
    const startedAt = performance.now();

    return new Promise((resolve, reject) => {
      const tick = () => {
        const value = getValue();
        if (value) {
          resolve(value);
          return;
        }

        if (performance.now() - startedAt >= timeoutMs) {
          reject(new Error("Thinking effort submenu not found"));
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
