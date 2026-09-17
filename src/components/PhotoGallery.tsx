import { useState } from "react";
import { photoRoleLabel, type ComplaintPhoto } from "@/schema";

interface PhotoGalleryProps {
  photos: ComplaintPhoto[];
  size?: number;
  editable?: boolean;
  onChangeRole?: (photoId: string, role: ComplaintPhoto["role"]) => void;
  onRemove?: (photoId: string) => void;
}

export function PhotoGallery({
  photos,
  size = 56,
  editable = false,
  onChangeRole,
  onRemove,
}: PhotoGalleryProps) {
  const [preview, setPreview] = useState<ComplaintPhoto | null>(null);

  if (!photos.length) {
    return <span className="muted">—</span>;
  }

  return (
    <>
      <div className="photo-gallery">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            className="photo-thumb"
            title={p.label || photoRoleLabel(p.role)}
            onClick={() => (p.url ? setPreview(p) : undefined)}
            style={{ width: size, height: Math.round(size * 0.75) }}
          >
            {p.url ? (
              <img src={p.url} alt={p.label ?? ""} />
            ) : (
              <span className="photo-thumb-empty">사진</span>
            )}
            <span className="photo-badge">
              {p.label?.slice(0, 6) || photoRoleLabel(p.role)}
            </span>
          </button>
        ))}
        {photos.length > 1 && (
          <span className="photo-count">{photos.length}장</span>
        )}
      </div>

      {preview && (
        <div className="photo-lightbox" onClick={() => setPreview(null)}>
          <div
            className="photo-lightbox-inner"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="photo-lightbox-head">
              <strong>{preview.label || photoRoleLabel(preview.role)}</strong>
              <span className="muted">
                {preview.sourceName} · {photos.indexOf(preview) + 1}/{photos.length}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPreview(null)}
              >
                닫기
              </button>
            </div>
            <img src={preview.url} alt="" className="photo-lightbox-img" />
            <div className="photo-lightbox-nav">
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`photo-thumb ${p.id === preview.id ? "active" : ""}`}
                  onClick={() => setPreview(p)}
                  style={{ width: 64, height: 48 }}
                >
                  <img src={p.url} alt="" />
                </button>
              ))}
            </div>
            {editable && (
              <div className="photo-lightbox-actions">
                <label className="field">
                  역할
                  <select
                    value={preview.role}
                    onChange={(e) => {
                      const role = e.target.value as ComplaintPhoto["role"];
                      onChangeRole?.(preview.id, role);
                      setPreview({ ...preview, role });
                    }}
                  >
                    <option value="receipt">현장</option>
                    <option value="before">처리 전</option>
                    <option value="after">처리 후</option>
                    <option value="other">기타/위치도</option>
                  </select>
                </label>
                {onRemove && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                      onRemove(preview.id);
                      setPreview(null);
                    }}
                  >
                    이 사진 제외
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
