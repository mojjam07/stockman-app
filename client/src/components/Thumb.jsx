import { useEffect, useState } from "react";

const TINTS = [["#E3EEE8", "#0F4A3A"], ["#FFF0C2", "#6B4B00"], ["#E6ECF5", "#27406B"], ["#F6E5E1", "#7A2A1F"], ["#ECE7F3", "#4A3568"]];

/** The item's photo, or a tinted tile with its first letter when it has none (or the photo fails to load). */
export default function Thumb({ item, size = "md" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.imageUrl]);
  const showImage = item.imageUrl && !failed;
  const [bg, fg] = TINTS[(item.name.codePointAt(0) || 0) % TINTS.length];
  return (
    <span className={`thumb thumb-${size}`} style={showImage ? undefined : { background: bg, color: fg }} aria-hidden="true">
      {showImage ? (
        <img src={item.imageUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span>{item.name.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}
