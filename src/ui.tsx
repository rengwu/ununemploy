import {
  forwardRef,
  useId,
  type ComponentProps,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import {
  CaretDownIcon,
  CheckIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react";

export const Button = forwardRef<
  HTMLButtonElement,
  ComponentProps<"button"> & {
    variant?: "primary" | "secondary" | "ghost" | "destructive";
    icon?: ElementType;
    shape?: "square";
    loading?: boolean;
  }
>(function Button(
  {
    variant = "secondary",
    icon: Icon,
    shape,
    loading,
    className = "",
    disabled,
    type = "button",
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`ui-button ${className}`}
      data-variant={variant}
      data-shape={shape}
    >
      {loading ? (
        <CircleNotchIcon className="ui-spinner" aria-hidden size={16} />
      ) : Icon ? (
        <Icon size={16} aria-hidden />
      ) : null}
      {children}
    </button>
  );
});
export const Input = forwardRef<
  HTMLInputElement,
  ComponentProps<"input"> & { label?: string }
>(function Input({ label, id, className = "", ...props }, ref) {
  const generated = useId();
  const field = (
    <input
      {...props}
      ref={ref}
      id={id || generated}
      className={`ui-input ${label ? "" : className}`}
    />
  );
  return label ? (
    <label htmlFor={id || generated} className={`ui-field ${className}`}>
      <span>{label}</span>
      {field}
    </label>
  ) : (
    field
  );
});
export const InputArea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<"textarea"> & { label?: string }
>(function InputArea({ label, id, className = "", ...props }, ref) {
  const generated = useId();
  const field = (
    <textarea
      {...props}
      ref={ref}
      id={id || generated}
      className={`ui-input ui-textarea ${label ? "" : className}`}
    />
  );
  return label ? (
    <label htmlFor={id || generated} className={`ui-field ${className}`}>
      <span>{label}</span>
      {field}
    </label>
  ) : (
    field
  );
});
function SelectControl({
  label,
  className = "",
  children,
  placeholder,
  "aria-label": ariaLabel,
  ...props
}: {
  label?: string;
  className?: string;
  children: ReactNode;
  placeholder?: string;
  "aria-label"?: string;
  value: string;
  onValueChange: (value: string | null) => void;
  items?: Record<string, ReactNode>;
  disabled?: boolean;
  name?: string;
}) {
  const id = useId();
  const control = (
    <BaseSelect.Root {...props}>
      <BaseSelect.Trigger
        id={id}
        aria-label={ariaLabel || label}
        className={`ui-select ${label ? "" : className}`}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon>
          <CaretDownIcon size={12} aria-hidden />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="ui-positioner"
        >
          <BaseSelect.Popup className="ui-menu">
            <BaseSelect.List>{children}</BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
  return label ? (
    <div className={`ui-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {control}
    </div>
  ) : (
    control
  );
}
export const Select = Object.assign(SelectControl, {
  Option: ({ value, children }: { value: string; children: ReactNode }) => (
    <BaseSelect.Item value={value} className="ui-option">
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
      <BaseSelect.ItemIndicator>
        <CheckIcon size={14} aria-hidden />
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  ),
});
function DialogContent({
  className = "",
  children,
  size,
}: {
  className?: string;
  children: ReactNode;
  size?: "lg";
}) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="ui-backdrop" />
      <BaseDialog.Popup className={`ui-dialog ${className}`} data-size={size}>
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}
export const Dialog = Object.assign(DialogContent, {
  Root: BaseDialog.Root,
  Title: BaseDialog.Title,
  Description: BaseDialog.Description,
});
export function Tabs({
  value,
  onValueChange,
  tabs,
  className = "",
  listClassName = "",
}: {
  value: string;
  onValueChange: (value: string) => void;
  tabs: { value: string; label: string }[];
  className?: string;
  listClassName?: string;
  variant?: "underline";
}) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(v) => onValueChange(String(v))}
      className={className}
    >
      <BaseTabs.List
        className={`ui-tabs ${listClassName}`}
        aria-label="Job details"
      >
        {tabs.map((t) => (
          <BaseTabs.Tab key={t.value} value={t.value} className="ui-tab">
            {t.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
    </BaseTabs.Root>
  );
}
export function Banner({
  variant,
  title,
  action,
}: {
  variant?: "error" | "warning" | "info" | "success";
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className="ui-banner"
      data-variant={variant}
      role={variant === "error" ? "alert" : "status"}
    >
      <span>{title}</span>
      {action}
    </div>
  );
}
export const Table = Object.assign(
  ({ className = "", ...props }: ComponentProps<"table">) => (
    <table {...props} className={`ui-table ${className}`} />
  ),
  {
    Header: ({
      sticky,
      ...props
    }: ComponentProps<"thead"> & { sticky?: boolean }) => (
      <thead {...props} data-sticky={sticky} />
    ),
    Body: (props: ComponentProps<"tbody">) => <tbody {...props} />,
    Row: (props: ComponentProps<"tr">) => <tr {...props} />,
    Head: (props: ComponentProps<"th">) => <th scope="col" {...props} />,
    Cell: (props: ComponentProps<"td">) => <td {...props} />,
  },
);
export const TooltipProvider = BaseTooltip.Provider;
export function Tooltip({
  content,
  render,
  disabled,
  side,
}: {
  content: string;
  render: ReactElement;
  disabled?: boolean;
  side?: "bottom";
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={render} disabled={disabled} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          side={side}
          sideOffset={6}
          className="ui-positioner"
        >
          <BaseTooltip.Popup className="ui-tooltip">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
