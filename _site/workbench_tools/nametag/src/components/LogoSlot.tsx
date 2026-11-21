import React from 'react';

/**
 * Logo component rendering the plain nametag.svg image with a pistachio-green glow,
 * without any surrounding rounded-square frame.
 */
export const LogoSlot: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <img
      src="./nametag.svg"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`w-9 h-9 object-contain shrink-0 select-none pointer-events-none [image-rendering:pixelated] drop-shadow-[0_0_10px_rgba(190,242,100,0.45)] ${className}`}
    />
  );
};
