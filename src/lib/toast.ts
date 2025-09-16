// Simple toast implementation to replace sonner
export const toast = {
  success: (message: string) => {
    console.log('✅ Success:', message);
    // In a real implementation, this would show a toast notification
  },
  error: (message: string) => {
    console.error('❌ Error:', message);
    // In a real implementation, this would show an error toast
  },
  info: (message: string) => {
    console.info('ℹ️ Info:', message);
    // In a real implementation, this would show an info toast
  },
  warning: (message: string) => {
    console.warn('⚠️ Warning:', message);
    // In a real implementation, this would show a warning toast
  }
};

export default toast;