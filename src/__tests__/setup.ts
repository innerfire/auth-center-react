/**
 * Vitest global setup for jsdom environment.
 *
 * AntD v6 + jsdom lacks matchMedia and ResizeObserver — we polyfill both
 * so all component tests can render without "not implemented" warnings.
 */

// ─── matchMedia polyfill ────────────────────────────────────────────
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ─── ResizeObserver polyfill ────────────────────────────────────────
if (typeof window !== "undefined" && typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverMock {
    private _cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this._cb = cb;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserverMock,
  });
}

// ─── PointerEvent polyfill (needed for Drawer/Popover interactions) ──
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  const PointerEventMock = class PointerEvent extends Event {
    clientX = 0;
    clientY = 0;
    pointerId = 0;
    pointerType = "";
    constructor(type: string, props?: PointerEventInit) {
      super(type, props);
      if (props) {
        this.clientX = props.clientX ?? 0;
        this.clientY = props.clientY ?? 0;
        this.pointerId = props.pointerId ?? 0;
        this.pointerType = props.pointerType ?? "";
      }
    }
  };
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: PointerEventMock,
  });
}

// ─── clipboard stub ────────────────────────────────────────────────
if (typeof navigator !== "undefined" && !navigator.clipboard) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {},
      readText: async () => "",
    },
  });
}

// ─── HTMLDialogElement (AntD Modal uses it in newer versions) ─────
if (typeof HTMLDialogElement === "undefined") {
  Object.defineProperty(globalThis, "HTMLDialogElement", {
    configurable: true,
    value: class {
      showModal() {}
      close() {}
    },
  });
}

// ─── @testing-library/jest-dom matchers (side-effect import) ──────
import "@testing-library/jest-dom/vitest";
