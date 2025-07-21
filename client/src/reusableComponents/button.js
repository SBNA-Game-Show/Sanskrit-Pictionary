import React from "react";
 
const Button = ({
  label="",
  height = "",
  width = "",
  background = "",
  icon = null,
  margin = "m-0",
  border = "",
  hoverBackground = "hover:text-sky-600",
  onClick,
  darkText = "",
  fontSize = "text-[13px]",
  darkBackground = "",
}) => {
  return (
    <button
      onClick={onClick}
      style={{height,width}}
      className={`
        ${background} ${margin}
        rounded-4xl
        ${border}
        active:border-blue-600 active:shadow-gray-600 active:shadow
        font-serif tracking-[.13em] ${hoverBackground}
        capitalize hover:italic transition delay-150 duration-300 ease-in-out
        hover:-translate-y-1 hover:scale-110
        flex items-center justify-center
        font-semibold ${darkText}  cursor-pointer ${fontSize} ${darkBackground}
      `}
    >
      {icon && (
        <span className="text-4xl flex items-center justify-center">
          {icon}
        </span>
      )}
      {label}
    </button>
  );
};
 
export default Button;