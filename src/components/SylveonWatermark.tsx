import React from 'react';

/**
 * Custom artistic SVG watermark of the Fairy-type Pokémon Sylveon,
 * rendered as a delicate non-interactive background layer across the studio.
 */
export const SylveonWatermark: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-0 flex items-center justify-center"
    >
      {/* Ambient pastel glow */}
      <div className="absolute -top-24 -right-24 w-[560px] h-[560px] rounded-full bg-pink-300/35 blur-3xl" />
      <div className="absolute -bottom-28 -left-24 w-[560px] h-[560px] rounded-full bg-sky-300/35 blur-3xl" />

      {/* Main Sylveon Silhouette & Ribbon Illustration Watermark */}
      <svg
        viewBox="0 0 800 700"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[88vw] max-w-[820px] h-auto opacity-[0.35] translate-y-4"
      >
        {/* Flowing Feelers / Ribbons in Background */}
        <path
          d="M330 250 C200 180, 90 260, 75 380 C65 460, 140 500, 195 455"
          stroke="#EC4899"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M75 380 C65 460, 140 500, 195 455"
          stroke="#0284C7"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M470 250 C610 175, 720 265, 725 385 C730 465, 650 505, 595 460"
          stroke="#EC4899"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M725 385 C730 465, 650 505, 595 460"
          stroke="#0284C7"
          strokeWidth="22"
          strokeLinecap="round"
        />

        {/* Lower Chest Ribbon Feelers */}
        <path
          d="M365 430 C250 470, 160 555, 190 630 C205 665, 260 660, 290 620"
          stroke="#F472B6"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M190 630 C205 665, 260 660, 290 620"
          stroke="#38BDF8"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M435 430 C550 470, 640 555, 610 630 C595 665, 540 660, 510 620"
          stroke="#F472B6"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M610 630 C595 665, 540 660, 510 620"
          stroke="#38BDF8"
          strokeWidth="18"
          strokeLinecap="round"
        />

        {/* Left Long Ear */}
        <path
          d="M345 235 C295 135, 240 50, 210 42 C180 35, 195 140, 285 265 Z"
          fill="#F472B6"
          stroke="#BE185D"
          strokeWidth="6"
        />
        <path
          d="M332 232 C292 150, 248 80, 226 74 C210 70, 222 145, 292 252 Z"
          fill="#0284C7"
        />

        {/* Right Long Ear */}
        <path
          d="M455 235 C505 135, 560 50, 590 42 C620 35, 605 140, 515 265 Z"
          fill="#F472B6"
          stroke="#BE185D"
          strokeWidth="6"
        />
        <path
          d="M468 232 C508 150, 552 80, 574 74 C590 70, 578 145, 508 252 Z"
          fill="#0284C7"
        />

        {/* Graceful Seated Body & Fluffy Tail */}
        <path
          d="M475 565 C565 555, 625 485, 595 430 C570 390, 505 445, 465 510 Z"
          fill="#F472B6"
          stroke="#BE185D"
          strokeWidth="6"
        />
        <path
          d="M335 415 C315 485, 310 565, 335 615 L465 615 C490 565, 485 485, 465 415 Z"
          fill="#FCE7F3"
          stroke="#BE185D"
          strokeWidth="6"
        />

        {/* Sylveon Head */}
        <ellipse
          cx="400"
          cy="315"
          rx="98"
          ry="86"
          fill="#FFF1F2"
          stroke="#BE185D"
          strokeWidth="6"
        />
        {/* Forehead Pink Crown Marking */}
        <path
          d="M325 270 C360 225, 440 225, 475 270 C450 295, 425 275, 400 300 C375 275, 350 295, 325 270 Z"
          fill="#F472B6"
        />

        {/* Luminous Cerulean Eyes */}
        <ellipse cx="358" cy="322" rx="14" ry="20" fill="#0284C7" />
        <ellipse cx="354" cy="314" rx="5" ry="7" fill="#FFFFFF" />
        <ellipse cx="442" cy="322" rx="14" ry="20" fill="#0284C7" />
        <ellipse cx="438" cy="314" rx="5" ry="7" fill="#FFFFFF" />

        {/* Friendly Smile */}
        <path
          d="M386 355 Q400 366 414 355"
          stroke="#BE185D"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Top Ear Bow (Left Ear Base) */}
        <g transform="translate(295, 225) rotate(-18)">
          <path
            d="M0 0 C-45 -32, -62 -10, -52 20 C-42 42, -18 28, 0 8 Z"
            fill="#F9A8D4"
            stroke="#BE185D"
            strokeWidth="5"
          />
          <path
            d="M0 0 C45 -32, 62 -10, 52 20 C42 42, 18 28, 0 8 Z"
            fill="#F9A8D4"
            stroke="#BE185D"
            strokeWidth="5"
          />
          <circle cx="0" cy="4" r="14" fill="#EC4899" stroke="#BE185D" strokeWidth="5" />
        </g>

        {/* Signature Chest Bow */}
        <g transform="translate(400, 422)">
          <path
            d="M0 0 C-65 -42, -85 -12, -72 28 C-58 55, -25 36, 0 12 Z"
            fill="#F9A8D4"
            stroke="#BE185D"
            strokeWidth="6"
          />
          <path
            d="M0 0 C65 -42, 85 -12, 72 28 C58 55, 25 36, 0 12 Z"
            fill="#F9A8D4"
            stroke="#BE185D"
            strokeWidth="6"
          />
          <path
            d="M-55 -12 C-70 -4, -70 14, -52 20"
            stroke="#0284C7"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M55 -12 C70 -4, 70 14, 52 20"
            stroke="#0284C7"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle cx="0" cy="5" r="18" fill="#EC4899" stroke="#BE185D" strokeWidth="6" />
        </g>

        {/* Subtle Fairy Sparkle Stars */}
        <path
          d="M140 160 L148 182 L170 190 L148 198 L140 220 L132 198 L110 190 L132 182 Z"
          fill="#0284C7"
        />
        <path
          d="M660 150 L666 168 L684 174 L666 180 L660 198 L654 180 L636 174 L654 168 Z"
          fill="#EC4899"
        />
      </svg>
    </div>
  );
};

/**
 * Small crisp Sylveon Ribbon Bow emblem for UI headers and stage accents
 */
export const SylveonBowEmblem: React.FC<{ className?: string }> = ({
  className = 'w-7 h-5',
}) => (
  <svg
    viewBox="0 0 64 44"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M32 22 C12 4, 4 12, 6 26 C8 38, 20 34, 32 24 Z"
      fill="#F9A8D4"
      stroke="#DB2777"
      strokeWidth="3"
    />
    <path
      d="M32 22 C52 4, 60 12, 58 26 C56 38, 44 34, 32 24 Z"
      fill="#F9A8D4"
      stroke="#DB2777"
      strokeWidth="3"
    />
    <path
      d="M11 16 C8 20, 8 25, 12 28"
      stroke="#0284C7"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <path
      d="M53 16 C56 20, 56 25, 52 28"
      stroke="#0284C7"
      strokeWidth="3.5"
      strokeLinecap="round"
    />
    <circle cx="32" cy="22" r="6.5" fill="#EC4899" stroke="#DB2777" strokeWidth="3" />
  </svg>
);
