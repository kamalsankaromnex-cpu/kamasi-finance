"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/currency";
import { FinancialBadge } from "@/components/ui/financial-badge";
import { FormErrorReassurance } from "@/components/ui/form-error-reassurance";
import { Bot, Send, Sparkles, ShieldCheck, CheckCircle2, XCircle, ArrowRight } from "lucide-react";

const STARTER_PROMPTS = [
  "Where did my money go this month?",
  "How much can I save?",
  "When will I reach my goals?",
  "Show my upcoming EMIs.",
  "What happens if my salary increases 8%?",
  "Record ₹2,500 grocery expense from Bank Account",
];

interface ChatMessage {
  id: string;
  sender: "USER" | "AI";
  text: string;
  response?: any;
  proposal?: any;
}

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init",
      sender: "AI",
      text: "Hello! I am your Kamasi Financial Assistant. I analyze your posted double-entry ledger, reporting summaries, and forecast projections. How can I help you today?",
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSendPrompt = async (promptToSend?: string) => {
    const prompt = promptToSend || inputPrompt;
    if (!prompt.trim() || loading) return;

    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, sender: "USER", text: prompt };
    setMessages((prev) => [...prev, userMsg]);
    if (!promptToSend) setInputPrompt("");
    setLoading(true);
    setErrorMessage(null);

    try {
      // Check if prompt is a mutation request (e.g. "Record 2500 expense")
      const lower = prompt.toLowerCase();
      if (lower.includes("record") || lower.includes("add expense") || lower.includes("pay")) {
        const propRes = await fetch("/api/ai/propose-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });

        if (propRes.ok) {
          const proposal = await propRes.json();
          const aiMsg: ChatMessage = {
            id: `ai_${Date.now()}`,
            sender: "AI",
            text: "I have prepared a structured financial action proposal for your review. Please confirm to execute:",
            proposal,
          };
          setMessages((prev) => [...prev, aiMsg]);
          return;
        }
      }

      // Read-only query execution
      const res = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (res.ok) {
        const responseData = await res.json();
        const aiMsg: ChatMessage = {
          id: `ai_${Date.now()}`,
          sender: "AI",
          text: responseData.answer || "Query executed.",
          response: responseData,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        setErrorMessage("AI query service encountered an error.");
      }
    } catch {
      setErrorMessage("Network timeout while contacting AI Assistant.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmProposal = async (proposal: any) => {
    try {
      setLoading(true);
      const res = await fetch("/api/ai/execute-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: proposal.id,
          confirmedParametersHash: proposal.parametersHash,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            sender: "AI",
            text: `Action confirmed and posted to ledger! (Journal ID: ${result.journalId})`,
          },
        ]);
      } else {
        setErrorMessage("Action confirmation failed. No money was changed.");
      }
    } catch {
      setErrorMessage("Network timeout during confirmation. No transaction was posted.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">AI Financial Assistant</h1>
              <FinancialBadge state="FORECAST" />
            </div>
            <p className="text-sm text-muted-foreground">
              Tool-driven, read-only co-pilot. Mutation proposals require explicit user confirmation.
            </p>
          </div>
        </div>

        {errorMessage && (
          <FormErrorReassurance
            type="CONFIRMED_FAILURE"
            message={errorMessage}
            onRetry={() => setErrorMessage(null)}
          />
        )}

        {/* Starter Prompts */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Suggested Questions & Actions</p>
          <div className="flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((promptText, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                onClick={() => handleSendPrompt(promptText)}
                className="text-xs h-8 bg-background border-muted hover:border-primary"
              >
                <Sparkles className="h-3 w-3 text-purple-500 mr-1.5" />
                <span>{promptText}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Chat History Box */}
        <Card className="min-h-[400px] flex flex-col">
          <CardHeader className="border-b py-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm font-semibold">Conversation History</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === "USER" ? "justify-end" : "justify-start"}`}
              >
                {msg.sender === "AI" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div className="space-y-2 max-w-lg">
                  <div
                    className={`p-3 rounded-xl text-xs leading-relaxed ${
                      msg.sender === "USER"
                        ? "bg-primary text-primary-foreground font-medium rounded-tr-none"
                        : "bg-muted/60 border text-foreground rounded-tl-none"
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* AI Response Query Sources */}
                  {msg.response?.sourceQueryIds && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pl-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-500" />
                      <span>Traceable Query Hash: {msg.response.sourceQueryIds.join(", ")}</span>
                    </div>
                  )}

                  {/* Structured Action Proposal Confirmation Card */}
                  {msg.proposal && (
                    <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-3">
                      <div className="flex items-center justify-between border-b pb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          Action Proposal Confirmation Card
                        </span>
                        <FinancialBadge state="PLANNED" />
                      </div>

                      <div className="space-y-1 text-xs">
                        <p className="font-semibold text-sm">{msg.proposal.humanReadableSummary}</p>
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground pt-1">
                          <div><span className="font-medium text-foreground">Action:</span> {msg.proposal.actionType}</div>
                          <div><span className="font-medium text-foreground">Amount:</span> ₹{msg.proposal.parameters.amount}</div>
                          <div><span className="font-medium text-foreground">Expires In:</span> 15 mins</div>
                          <div><span className="font-medium text-foreground">Hash:</span> {msg.proposal.parametersHash.slice(0, 10)}...</div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button size="sm" variant="outline" className="h-8 text-xs">Cancel</Button>
                        <Button
                          size="sm"
                          onClick={() => handleConfirmProposal(msg.proposal)}
                          className="h-8 text-xs gap-1"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Confirm & Post Transaction</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 items-center text-xs text-muted-foreground italic">
                <Bot className="h-4 w-4 animate-spin text-primary" />
                <span>Processing financial query...</span>
              </div>
            )}
          </CardContent>

          {/* Prompt Input Box */}
          <div className="p-3 border-t bg-muted/20">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt();
              }}
              className="flex gap-2"
            >
              <Input
                placeholder="Ask about net worth, goals, or record an expense..."
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                className="text-xs bg-background"
              />
              <Button type="submit" size="sm" disabled={loading || !inputPrompt.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
