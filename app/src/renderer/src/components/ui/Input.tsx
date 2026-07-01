import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./Icon";

export function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      {children}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className={["ui-input", className].filter(Boolean).join(" ")} {...rest} />;
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return <textarea className={["ui-textarea", className].filter(Boolean).join(" ")} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  return (
    <span className="ui-select-wrap">
      <select className={["ui-select", className].filter(Boolean).join(" ")} {...rest}>
        {children}
      </select>
      <Icon name="chevron-top" size={12} />
    </span>
  );
}
