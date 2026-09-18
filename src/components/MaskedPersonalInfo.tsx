import { useState } from "react";
import { hasPersonalInfo, maskName, maskPhone } from "@/lib/privacy";
import { useSnapshotMask } from "@/store/SnapshotMaskStore";

interface MaskedPersonalInfoProps {
  name: string;
  phone?: string | null;
}

export function MaskedPersonalInfo({ name, phone }: MaskedPersonalInfoProps) {
  const forceMask = useSnapshotMask();
  const [revealed, setRevealed] = useState(false);
  const showRaw = !forceMask && revealed;
  const canReveal = !forceMask && hasPersonalInfo(name, phone);

  return (
    <div className="pii-cell">
      <div className="pii-values">
        <span className={showRaw ? "pii-raw" : "pii-masked"}>
          {showRaw ? name || "—" : maskName(name)}
        </span>
        {phone ? (
          <div className={`muted ${showRaw ? "pii-raw" : "pii-masked"}`}>
            {showRaw ? phone : maskPhone(phone)}
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
