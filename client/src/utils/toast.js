import { toast } from "react-toastify";

/**
 * Reusable toast notification utility
 * @param {string} message - The message to display
 * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
 * @param {object} options - Additional options (position, autoClose, etc.)
 */
export const showToast = (message, type = "info", options = {}) => {
  const defaultOptions = {
    position: "top-right",
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options,
  };

  switch (type) {
    case "success":
      toast.success(message, defaultOptions);
      break;
    case "error":
      toast.error(message, defaultOptions);
      break;
    case "warning":
      toast.warning(message, defaultOptions);
      break;
    case "info":
      toast.info(message, defaultOptions);
      break;
    default:
      toast(message, defaultOptions);
  }
};

// Shorthand helpers
export const toastSuccess = (message, options) =>
  showToast(message, "success", options);
export const toastError = (message, options) =>
  showToast(message, "error", options);
export const toastWarning = (message, options) =>
  showToast(message, "warning", options);
export const toastInfo = (message, options) =>
  showToast(message, "info", options);
