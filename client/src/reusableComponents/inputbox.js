import React from "react";

const InputBox = ({
  label = "",
  name = "",
  placeholder = "",
  type = "text",
  width = "w-80",
  height = "h-12",
  onChange = () => {},
}) => {
  return (
    <div className={`relative mt-1 ${width}`}>
      <input
        type={type}
        name={name}
        id={name}
        placeholder={placeholder}
        style={{height,width}}
        onChange={onChange}
        className={`
          peer block w-full appearance-none border-2
          border-gray-950 dark:border-gray-400
          rounded-md px-3 pt-5 pb-1 text-sm
          placeholder-transparent focus:outline-none focus:ring-2
          focus:ring-zinc-500 dark:focus:ring-xinc-500
          ${height} text-center shadow shadow-gray-300
          font-serif tracking-[.13em]  text-black dark:text-white
        `}
      />
      <label
        htmlFor={name}
        className={`
          absolute left-5 text-sm transition-all
          peer-placeholder-shown:top-3.5
          peer-placeholder-shown:text-sm
          peer-placeholder-shown:font-normal
          peer-focus:top-[-20px]
          peer-focus:text-xs
          peer-focus:font-bold
          peer-focus:text-gray-600 dark:peer-focus:text-gray-300
          peer-not-placeholder-shown:top-[-14px]
          peer-not-placeholder-shown:text-xs
          peer-not-placeholder-shown:font-bold
          peer-not-placeholder-shown:text-gray-600 dark:peer-not-placeholder-shown:text-gray-300
          font-serif text-[#262322] dark:text-gray-300
        `}
      >
        {label}
      </label>
    </div>
  );
};
 
export default InputBox;