"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  RotateCcw,
  Repeat,
  RefreshCw,
} from "lucide-react";

export interface TransactionCardData {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  origin?: string;
  categoryName?: string;
  categoryColor?: string;
  isInstallment?: boolean;
  currentInstallment?: number | null;
  totalInstallments?: number | null;
  isRecurring?: boolean;
  isFixed?: boolean;
  deletedAt?: Date | string | null;
}

export interface TransactionCardProps {
  transaction: TransactionCardData;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRestore?: (id: string) => void;
  showActions?: boolean;
  isTrash?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function TransactionCard({
  transaction,
  onEdit,
  onDelete,
  onRestore,
  showActions = true,
  isTrash = false,
  isLoading = false,
  className = "",
}: TransactionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const amountColor =
    transaction.type === "INCOME"
      ? "text-green-600"
      : transaction.type === "TRANSFER"
      ? "text-gray-400"
      : "text-red-600";

  const amountPrefix = transaction.type === "INCOME" ? "+" : "";

  return (
    <div
      className={`rounded-lg border bg-white p-4 transition-shadow hover:shadow-sm ${
        isTrash ? "opacity-75" : ""
      } ${className}`}
    >
      {/* Main content - always visible */}
      <div
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Row 1: Category dot + Description */}
        <div className="flex items-start gap-2 mb-2">
          {transaction.categoryColor && (
            <div
              className="h-3 w-3 rounded-full mt-1 flex-shrink-0"
              style={{ backgroundColor: transaction.categoryColor }}
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {transaction.description}
            </p>
          </div>
          {showActions && (
            <div className="flex-shrink-0">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          )}
        </div>

        {/* Row 2: Date and Amount */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {formatDate(transaction.date)}
          </span>
          <span className={`font-semibold ${amountColor}`}>
            {amountPrefix}
            {formatCurrency(transaction.amount)}
          </span>
        </div>

        {/* Row 3: Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          {transaction.origin && (
            <Badge variant="outline" className="text-xs bg-gray-50">
              {transaction.origin}
            </Badge>
          )}
          {transaction.categoryName && (
            <Badge
              variant="outline"
              className="text-xs"
              style={{
                backgroundColor: transaction.categoryColor
                  ? `${transaction.categoryColor}15`
                  : undefined,
                borderColor: transaction.categoryColor || undefined,
                color: transaction.categoryColor || undefined,
              }}
            >
              {transaction.categoryName}
            </Badge>
          )}
          {transaction.isInstallment && (
            <Badge
              variant="outline"
              className="text-xs bg-purple-50 text-purple-700 border-purple-200"
            >
              <Repeat className="h-3 w-3 mr-1" />
              {transaction.currentInstallment && transaction.totalInstallments
                ? `${transaction.currentInstallment}/${transaction.totalInstallments}`
                : "Parcela"}
            </Badge>
          )}
          {transaction.isRecurring && (
            <Badge
              variant="outline"
              className="text-xs bg-blue-50 text-blue-700 border-blue-200"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Recorrente
            </Badge>
          )}
          {transaction.isFixed && (
            <Badge
              variant="outline"
              className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200"
            >
              Fixo
            </Badge>
          )}
        </div>
      </div>

      {/* Expanded content - action buttons */}
      {isExpanded && showActions && (
        <div className="mt-4 pt-3 border-t flex justify-end gap-2">
          {isTrash ? (
            <>
              {onRestore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore(transaction.id);
                  }}
                  disabled={isLoading}
                  className="flex-1"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Restaurar
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(transaction.id);
                  }}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir
                </Button>
              )}
            </>
          ) : (
            <>
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(transaction.id);
                  }}
                  disabled={isLoading}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Editar
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(transaction.id);
                  }}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
