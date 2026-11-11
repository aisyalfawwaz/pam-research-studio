import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  action: () => void;
  separator?: boolean;
}
export function MenuBar({
  menus,
}: {
  menus: { label: string; items: MenuItem[] }[];
}) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggers = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, []);
  const focusFirst = () =>
    requestAnimationFrame(() =>
      ref.current
        ?.querySelector<HTMLButtonElement>(
          '[role="menu"] button:not(:disabled)',
        )
        ?.focus(),
    );
  return (
    <div
      className="menu-bar"
      role="menubar"
      ref={ref}
      aria-label="Application menu"
    >
      {menus.map((menu, index) => (
        <div className="menu-entry" key={menu.label}>
          <button
            ref={(element) => {
              triggers.current[index] = element;
            }}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === index}
            onClick={() => {
              setOpen(open === index ? null : index);
              if (open !== index) focusFirst();
            }}
            onPointerEnter={() => {
              if (open !== null) setOpen(index);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(index);
                focusFirst();
              } else if (
                event.key === "ArrowRight" ||
                event.key === "ArrowLeft"
              ) {
                event.preventDefault();
                triggers.current[
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    menus.length) %
                    menus.length
                ]?.focus();
              }
            }}
          >
            {menu.label}
          </button>
          {open === index ? (
            <div
              className="menu-popup"
              role="menu"
              aria-label={`${menu.label} menu`}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(null);
                  triggers.current[index]?.focus();
                } else if (
                  event.key === "ArrowDown" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  const items = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button:not(:disabled)",
                    ),
                  );
                  const current = items.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  items[
                    (current +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                      items.length
                  ]?.focus();
                } else if (
                  event.key === "ArrowRight" ||
                  event.key === "ArrowLeft"
                ) {
                  event.preventDefault();
                  setOpen(
                    (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      menus.length) %
                      menus.length,
                  );
                  focusFirst();
                }
              }}
            >
              {menu.items.map((item, i) => (
                <div key={item.label}>
                  {item.separator ? <div role="separator" /> : null}
                  <button
                    role={
                      item.checked === undefined
                        ? "menuitem"
                        : "menuitemcheckbox"
                    }
                    aria-checked={item.checked}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(null);
                      item.action();
                    }}
                  >
                    <span className="menu-check">
                      {item.checked ? <Check size={13} /> : null}
                    </span>
                    <span>{item.label}</span>
                    <kbd>{item.shortcut}</kbd>
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function Splitter({
  label,
  value,
  onChange,
  min,
  max,
  axis = "x",
  direction = 1,
  className = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  axis?: "x" | "y";
  direction?: number;
  className?: string;
}) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  return (
    <div
      className={`splitter ${axis === "y" ? "split-horizontal" : "split-vertical"} ${className}`}
      role="separator"
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        drag.current = {
          start: axis === "x" ? event.clientX : event.clientY,
          value,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current)
          onChange(
            Math.max(
              min,
              Math.min(
                max,
                drag.current.value +
                  ((axis === "x" ? event.clientX : event.clientY) -
                    drag.current.start) *
                    direction,
              ),
            ),
          );
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onKeyDown={(event) => {
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          onChange(
            Math.max(
              min,
              Math.min(
                max,
                value +
                  (event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -10
                    : 10) *
                    direction,
              ),
            ),
          );
        }
      }}
    />
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  className = "",
}: React.PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
  className?: string;
}>) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = title.toLowerCase().replace(/\W+/g, "-");
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`native-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <strong id={titleId}>{title}</strong>
        <button aria-label={`Close ${title}`} onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
