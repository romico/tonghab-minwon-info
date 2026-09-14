import { useState } from "react";
import { hasPersonalInfo, maskName, maskPhone } from "@/lib/privacy";

interface MaskedPersonalInfoProps {
  name: string;
  phone?: string | null;
}

export function MaskedPersonalInfo({ name, phone }: MaskedPersonalInfoProps) {
  const [revealed, setRevealed] = useState(false);
  const canReveal = hasPersonalInfo(name, phone);

  return (
    <div className="pii-cell">
      <div className="pii-values">
        <span className={revealed ? "pii-raw" : "pii-masked"}>
          {revealed ? name || "—" : maskName(name)}
        </span>
        {phone ? (
          <div className={`muted ${revealed ? "pii-raw" : "pii-masked"}`}>
            {revealed ? phone : maskPhone(phone)}
          </div>
        ) : null}
      </div>
      {canReveal && (
        <button
          type="button"
          className="btn btn-ghost pii-toggle"
          onClick={() => setRevealed((v) => !v)}
          aria-pressed={revealed}
          title={revealed ? "개인정보 숨기기" : "원본 개인정보 보기"}
        >
          {revealed ? "숨김" : "보기"}
        </button>
      )}
    </div>
  );
}
