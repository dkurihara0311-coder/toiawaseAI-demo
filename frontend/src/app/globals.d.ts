declare namespace React {
  type ReactNode = any;
  type ReactElement = any;
  interface CSSProperties { [key: string]: any; }
  function useState<T>(initialValue: T | (() => T)): [T, (newValue: T | ((prev: T) => T)) => void];
  function useEffect(effect: () => void | (() => void), deps?: any[]): void;
  function useRef<T>(initialValue: T | null): { current: T | null };
  function useMemo<T>(factory: () => T, deps?: any[]): T;
  function useCallback<T extends (...args: any[]) => any>(callback: T, deps?: any[]): T;
  interface ChangeEvent<T = Element> { target: T & { value: string }; }
  interface KeyboardEvent<T = Element> { key: string; preventDefault(): void; shiftKey: boolean; }
  interface DragEvent<T = Element> { 
    preventDefault(): void; 
    stopPropagation(): void; 
    dataTransfer: { dropEffect: string; files: FileList; };
  }
  interface MouseEvent<T = Element> { stopPropagation(): void; }
  type ChangeEventHandler<T = Element> = (event: ChangeEvent<T>) => void;
}

declare module "react" {
  export = React;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elem: string]: any;
  }
}

declare var process: {
  env: {
    [key: string]: string | undefined;
  };
};

declare module "next" {
  export type Metadata = any;
}

declare module "next/font/google" {
  export const Inter: (options: any) => any;
  export const Outfit: (options: any) => any;
  export const Roboto: (options: any) => any;
}

declare module "tailwindcss" {
  export type Config = any;
}

declare module "lucide-react" {
  export const FileText: any;
  export const Send: any;
  export const Upload: any;
  export const Plus: any;
  export const Search: any;
  export const PanelRightOpen: any;
  export const PanelRightClose: any;
  export const MoreVertical: any;
  export const Paperclip: any;
  export const CheckCircle2: any;
  export const Loader2: any;
  export const Trash2: any;
  export const MessageSquare: any;
  export const Database: any;
}

declare module "axios" {
  const axios: any;
  export default axios;
}

interface HTMLDivElement extends HTMLElement {}
interface HTMLElement extends Element {}
interface Element {}
interface FileList {}
interface File {}
