import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ leftIcon, style, ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      {leftIcon}
      <input
        {...rest}
        type={visible ? "text" : "password"}
        style={{ paddingRight: "2.25rem", ...style }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        style={{
          position: "absolute",
          right: "0.5rem",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0.25rem",
          display: "flex",
          alignItems: "center",
          color: "var(--text-light)",
        }}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}
