import { ComponentProps, ReactNode, forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Shared look for filled inputs on phones: tall, soft grey, gold focus ring. */
export const fieldClass =
  "h-12 rounded-xl border-transparent bg-secondary px-4 text-base transition-colors placeholder:text-muted-foreground/70 focus-visible:border-input focus-visible:bg-background";

export const fieldErrorClass =
  "border-destructive bg-destructive/5 focus-visible:border-destructive focus-visible:ring-destructive";

interface ShellProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  labelAction?: ReactNode;
  children: ReactNode;
}

/** Label + control + one message line (error wins over hint). The message id is `${id}-msg`. */
export const FieldShell = ({ id, label, error, hint, labelAction, children }: ShellProps) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      {labelAction}
    </div>
    {children}
    {(error || hint) && (
      <p
        id={`${id}-msg`}
        role={error ? "alert" : undefined}
        className={cn("text-[13px] leading-snug", error ? "font-medium text-destructive" : "text-muted-foreground")}
      >
        {error ?? hint}
      </p>
    )}
  </div>
);

interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  labelAction?: ReactNode;
  trailing?: ReactNode;
}

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ id, label, error, hint, labelAction, trailing, className, ...rest }, ref) => (
    <FieldShell id={id} label={label} error={error} hint={hint} labelAction={labelAction}>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={cn(fieldClass, trailing && "pr-12", error && fieldErrorClass, className)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0.5 flex items-center">{trailing}</div>}
      </div>
    </FieldShell>
  ),
);
TextField.displayName = "TextField";

export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, "type" | "trailing">>((props, ref) => {
  const [show, setShow] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={show ? "text" : "password"}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
        </button>
      }
    />
  );
});
PasswordField.displayName = "PasswordField";

export default TextField;
