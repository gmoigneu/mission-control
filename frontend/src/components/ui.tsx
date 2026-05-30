import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      className={`rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 ${className}`}
      {...rest}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none ${className}`}
      {...rest}
    />
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
}) {
  return (
    <select
      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
