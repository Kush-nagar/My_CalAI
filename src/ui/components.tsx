import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { sourceChipLabel } from './helpers';
import type { SourceRef } from '../domain/types';

// ---------- Sheet: modal dialog with focus trap + restore ----------
const stack: HTMLElement[] = [];

function syncInert() {
  const app = document.getElementById('app');
  if (app) (stack.length ? app.setAttribute('inert', '') : app.removeAttribute('inert'));
  const top = stack[stack.length - 1];
  for (const el of stack) {
    if (el !== top || el.dataset.hold === '1') el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
  document.body.style.overflow = stack.length ? 'hidden' : '';
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';

export function Sheet(props: {
  title: string;
  onClose(): void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  /** Hold this sheet inert while an external layer (e.g. scanner) is above it. */
  hold?: boolean;
  back?: { label: string; onClick(): void };
  /** Change to move focus into the new content (e.g. wizard step changes). */
  focusKey?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;

  useEffect(() => {
    const el = ref.current!;
    const prev = document.activeElement as HTMLElement | null;
    stack.push(el);
    syncInert();
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('.sheet-body ' + FOCUSABLE.split(',').join(',.sheet-body ')) ?? el;
    target.focus({ preventScroll: true });
    return () => {
      stack.splice(stack.indexOf(el), 1);
      syncInert();
      prev?.focus?.({ preventScroll: true });
    };
  }, []);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const el = ref.current!;
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus({ preventScroll: true });
  }, [props.focusKey]);

  useEffect(() => {
    // Escape closes the top-most sheet even if focus drifted to <body>.
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === ref.current && ref.current?.dataset.hold !== '1') closeRef.current();
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (props.hold) el.dataset.hold = '1';
    else delete el.dataset.hold;
    syncInert();
  }, [props.hold]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div class="sheet-root">
      <div class="sheet-scrim" aria-hidden="true" />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={props.title} ref={ref} tabIndex={-1} onKeyDown={onKey}>
        <header class="sheet-head">
          {props.back ? (
            <button class="icon-btn" type="button" onClick={props.back.onClick} aria-label={props.back.label}>
              <Icon name="back" />
            </button>
          ) : null}
          <h2 class="sheet-title">{props.title}</h2>
          <button class="icon-btn" type="button" onClick={props.onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div class="sheet-body">{props.children}</div>
        {props.footer ? <footer class="sheet-foot">{props.footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

// ---------- small parts ----------
export function SourceChip({ source }: { source: SourceRef }) {
  return <span class="chip" title={source.name}>{sourceChipLabel(source)}</span>;
}

export function EstimateBadge() {
  return (
    <span class="chip chip-est">
      <Icon name="estimate" size={14} /> Estimated
    </span>
  );
}

export function Segmented(props: {
  name: string;
  legend: string;
  value: string;
  options: { value: string; label: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange(v: any): void;
  hideLegend?: boolean;
}) {
  return (
    <fieldset class="seg">
      <legend class={props.hideLegend ? 'sr-only' : 'seg-legend'}>{props.legend}</legend>
      <div class="seg-track">
        {props.options.map((o) => (
          <label key={o.value} class="seg-opt">
            <input type="radio" name={props.name} value={o.value} checked={props.value === o.value} onChange={() => props.onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Switch(props: { label: string; hint?: ComponentChildren; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label class="switch-row">
      <span class="switch-text">
        <span class="switch-label">{props.label}</span>
        {props.hint ? <span class="hint">{props.hint}</span> : null}
      </span>
      <input type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      <span class="switch-ui" aria-hidden="true" />
    </label>
  );
}

let uid = 0;
export function useUid(prefix = 'f') {
  const r = useRef('');
  if (!r.current) r.current = `${prefix}${++uid}`;
  return r.current;
}

export function TextField(props: {
  label: string;
  value: string;
  onInput(v: string): void;
  hint?: ComponentChildren;
  error?: string | null;
  suffix?: string;
  multiline?: boolean;
  autofocus?: boolean;
  inputMode?: 'decimal' | 'numeric' | 'text' | 'search';
  autocomplete?: string;
  maxLength?: number;
}) {
  const id = useUid();
  const { label, value, onInput, hint, error, suffix, multiline, autofocus, ...rest } = props;
  const inputAttrs = { inputMode: rest.inputMode, autocomplete: rest.autocomplete, maxLength: rest.maxLength };
  const describedBy = [hint ? id + '-h' : '', error ? id + '-e' : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'data-autofocus': autofocus ? '' : undefined,
  };
  return (
    <div class={'field' + (error ? ' has-error' : '')}>
      <label for={id}>{label}</label>
      <div class="field-row">
        {multiline ? (
          <textarea {...common} maxLength={rest.maxLength} rows={3} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />
        ) : (
          <input {...common} {...inputAttrs} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
        )}
        {suffix ? <span class="suffix" aria-hidden="true">{suffix}</span> : null}
      </div>
      {hint ? <p class="hint" id={id + '-h'}>{hint}</p> : null}
      {error ? (
        <p class="error" id={id + '-e'}>
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField(props: { label: string; value: string; onChange(v: string): void; options: { value: string; label: string }[]; hint?: string }) {
  const id = useUid();
  return (
    <div class="field">
      <label for={id}>{props.label}</label>
      <div class="field-row select-wrap">
        <select id={id} value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Icon name="down" size={18} class="select-caret" />
      </div>
      {props.hint ? <p class="hint">{props.hint}</p> : null}
    </div>
  );
}

/** Two-step destructive action; the confirm control is announced via role=alertdialog-like group. */
export function ConfirmButton(props: { label: string; confirmLabel: string; message: string; onConfirm(): void; disabled?: boolean }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" class="btn btn-danger-text" onClick={() => setAsking(true)} disabled={props.disabled}>
        <Icon name="trash" size={18} /> {props.label}
      </button>
    );
  }
  return (
    <div class="confirm" role="group" aria-label="Confirm">
      <p>{props.message}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-danger" onClick={props.onConfirm} data-autofocus-confirm ref={(el) => el?.focus()}>
          {props.confirmLabel}
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => setAsking(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function EmptyState(props: { title: string; body: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty-art" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="96" height="96">
          <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" stroke-width="2" />
          <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.25" stroke-dasharray="2 5" />
          <circle cx="60" cy="40" r="11" fill="var(--turmeric)" />
          <circle cx="42" cy="74" r="11" fill="none" stroke="currentColor" stroke-width="2" />
          <circle cx="78" cy="74" r="11" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </div>
      <h2>{props.title}</h2>
      <p>{props.body}</p>
      {props.action}
    </div>
  );
}
