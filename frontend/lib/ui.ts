export const openSignIn = (then?: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fd-signin', { detail: then })) }
