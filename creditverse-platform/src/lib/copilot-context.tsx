import { createContext, useContext, useState, type ReactNode } from "react";

interface CopilotContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openWithTopic: (topic: string) => void;
  topic: string | null;
}

const noop = () => {};

const CopilotContext = createContext<CopilotContextValue>({
  open: false,
  setOpen: noop,
  openWithTopic: noop,
  topic: null,
});

export const CopilotProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);

  const openWithTopic = (t: string) => {
    setTopic(t);
    setOpen(true);
  };

  return (
    <CopilotContext.Provider value={{ open, setOpen, openWithTopic, topic }}>
      {children}
    </CopilotContext.Provider>
  );
};

export const useCopilot = () => useContext(CopilotContext);
