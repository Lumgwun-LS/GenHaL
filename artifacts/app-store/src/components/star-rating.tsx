import { Star } from "lucide-react";
import { useState } from "react";

interface StarRatingProps {
  value: number;
  max?: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
  size?: "sm" | "md" | "lg";
}

export function StarRating({ value, max = 5, interactive = false, onChange, size = "md" }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);
  const sizes = { sm: "w-3 h-3", md: "w-5 h-5", lg: "w-6 h-6" };
  const cls = sizes[size];

  return (
    <div className="flex gap-0.5" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: max }, (_, i) => {
        const filled = (hovered || value) > i;
        return (
          <Star
            key={i}
            className={`${cls} transition-colors ${filled ? "text-[#FF7F50] fill-[#FF7F50]" : "text-gray-600"} ${interactive ? "cursor-pointer" : ""}`}
            onMouseEnter={() => interactive && setHovered(i + 1)}
            onClick={() => interactive && onChange?.(i + 1)}
          />
        );
      })}
    </div>
  );
}
