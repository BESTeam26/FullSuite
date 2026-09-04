import { useState } from "react";
import { SubAccount, FulfillmentWorkOrder } from "@/lib/agency-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MessageSquare,
  Send,
  Paperclip,
  Clock,
  ShieldCheck,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  id: string;
  sender: string;
  role: "HQ Specialist" | "Organization Manager";
  text: string;
  time: string;
}

interface Props {
  workOrder: FulfillmentWorkOrder;
  onClose: () => void;
}

export const FulfillmentLiveChatModal = ({ workOrder, onClose }: Props) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      sender: "Daniel Reyes",
      role: "HQ Specialist",
      text: `Work order ${workOrder.id} (${workOrder.type}) received for client ${workOrder.clientName}. Commencing document verification.`,
      time: "10:15 AM",
    },
    {
      id: "msg-2",
      sender: `${workOrder.subAccountName} Admin`,
      role: "Organization Manager",
      text: "Updated proof of address attached to client file in Google Drive vault. Please verify when filing CFPB complaint.",
      time: "10:22 AM",
    },
  ]);

  const [input, setInput] = useState("");

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "HQ Senior Specialist",
      role: "HQ Specialist",
      text: input,
      time: "Just now",
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput("");
    toast({
      title: "Message Sent",
      description: `Notification dispatched to ${workOrder.subAccountName} manager.`,
    });
  };

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500 text-charcoal font-bold text-[10px]">
              {workOrder.id}
            </Badge>
            <h4 className="font-bold text-sm text-foreground">
              {workOrder.clientName}
            </h4>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {workOrder.subAccountName} · {workOrder.type} ({workOrder.round})
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-amber-500/40 text-status-warning text-[10px] flex items-center gap-1"
        >
          <Clock className="h-3 w-3" /> SLA: {workOrder.slaHoursRemaining}h
          remaining
        </Badge>
      </div>

      {/* Message Stream */}
      <div className="rounded-xl border border-border bg-card/60 p-3 max-h-72 overflow-y-auto space-y-3 text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`p-3 rounded-xl max-w-[85%] space-y-1 ${
              m.role === "HQ Specialist"
                ? "bg-amber-500/10 border border-amber-500/20 ml-auto text-right"
                : "bg-muted/80 border border-border text-left"
            }`}
          >
            <div className="flex items-center gap-2 justify-between text-[10px] text-muted-foreground">
              <span className="font-semibold text-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> {m.sender} ({m.role})
              </span>
              <span>{m.time}</span>
            </div>
            <p className="text-foreground leading-relaxed text-xs">{m.text}</p>
          </div>
        ))}
      </div>

      {/* Input controls */}
      <div className="space-y-2">
        <Textarea
          placeholder="Type live message or fulfillment instructions..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="text-xs min-h-[60px]"
        />
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground"
          >
            <Paperclip className="h-3.5 w-3.5 mr-1" /> Attach Evidence File
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              className="bg-gradient-gold text-charcoal font-bold text-xs"
            >
              <Send className="h-3.5 w-3.5 mr-1" /> Send Message
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
