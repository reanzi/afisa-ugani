/** A password field with an eye button to show what was typed, for checking it before sending. */
import { useState, type InputHTMLAttributes } from "react";
import { IconEye, IconEyeOff } from "./icons";
import { useT } from "./i18n";

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <span className="password-input">
      <input {...props} type={shown ? "text" : "password"} className={`input ${props.className ?? ""}`} autoCapitalize="off" spellCheck={false} />
      <button
        type="button"
        className="password-eye"
        aria-pressed={shown}
        aria-label={shown ? t("Ficha nenosiri", "Hide password") : t("Onyesha nenosiri", "Show password")}
        onClick={() => setShown((s) => !s)}
        disabled={props.disabled}
      >
        {shown ? <IconEyeOff /> : <IconEye />}
      </button>
    </span>
  );
}
