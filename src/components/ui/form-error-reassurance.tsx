"use client";

import { ShieldAlert, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "./button";

export interface FormErrorReassuranceProps {
  type: 'CONFIRMED_FAILURE' | 'NETWORK_TIMEOUT';
  message?: string;
  onRetry?: () => void;
}

export function FormErrorReassurance({ type, message, onRetry }: FormErrorReassuranceProps) {
  const isTimeout = type === 'NETWORK_TIMEOUT';

  return (
    <div
      className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
        isTimeout
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
          : 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200'
      }`}
    >
      <div
        className={`p-2 rounded-lg shrink-0 ${
          isTimeout ? 'bg-amber-500/20 text-amber-600' : 'bg-rose-500/20 text-rose-600'
        }`}
      >
        {isTimeout ? <AlertTriangle className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
      </div>

      <div className="flex-1 space-y-1">
        <h4 className="text-sm font-semibold">
          {isTimeout ? 'Network Timeout / Outcome Uncertain' : 'Action Could Not Be Saved'}
        </h4>
        <p className="text-xs leading-relaxed opacity-90">
          {message || (isTimeout ? 'We could not reach the server.' : 'Operation failed.')}
        </p>

        {/* Financial Reassurance Notice */}
        <div className="pt-1 text-xs font-semibold flex items-center gap-1.5">
          {isTimeout ? (
            <span>We could not confirm whether the transaction was saved. Please check your transactions before trying again.</span>
          ) : (
            <span className="text-rose-700 dark:text-rose-300">
              No money was changed. No transaction was posted.
            </span>
          )}
        </div>

        {onRetry && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-7 text-xs gap-1.5 bg-background border-muted-foreground/30"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Try Again</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
