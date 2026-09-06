import type { TicketStatus, InvoiceStatus } from "@/lib/types";

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
  paid: {
    label: "Paid",
    bg: "#DCFCE7", // bright light emerald
    text: "#15803D", // deep green
    border: "#86EFAC",
  },
  pending: {
    label: "Pending",
    bg: "#FEF3C7", // bright light amber
    text: "#B45309", // bold dark amber/brown
    border: "#FCD34D",
  },
  open: {
    label: "Open",
    bg: "#FEF3C7",
    text: "#B45309",
    border: "#FCD34D",
  },
  "in progress": {
    label: "In Progress",
    bg: "#DBEAFE",
    text: "#1D4ED8",
    border: "#93C5FD",
  },
  resolved: {
    label: "Resolved",
    bg: "#DCFCE7",
    text: "#15803D",
    border: "#86EFAC",
  },
  overdue: {
    label: "Overdue",
    bg: "#FEE2E2",
    text: "#B91C1C",
    border: "#FCA5A5",
  },
  cancelled: {
    label: "Cancelled",
    bg: "#F3F4F6",
    text: "#4B5563",
    border: "#D1D5DB",
  },
};

export function StatusBadge({
  status,
}: {
  status: TicketStatus | InvoiceStatus | string;
}) {
  const config = statusConfig[status.toLowerCase()] ?? {
    label: status,
    bg: "#F3F4F6",
    text: "#374151",
    border: "#D1D5DB",
  };

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap shadow-xs"
      style={{
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </span>
  );
}
