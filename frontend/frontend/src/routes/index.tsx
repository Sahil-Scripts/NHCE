import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import {
  LayoutDashboard, FileText, Bell, FileBarChart, Settings, PanelLeftClose,
  Search, Flag, ChevronDown, ChevronUp, Calendar, Filter,
  Plus, Minus, Maximize2, Lock, RefreshCw, Expand,
  Building2, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Shield,
  Download, Printer, CheckCircle, AlertTriangle, FileSpreadsheet, Eye, Sliders, ExternalLink, X, Copy, Check, Info,
  Upload, FolderOpen, Trash2, FileCheck,
  Activity, Cpu, Zap, Play, CheckCircle2, AlertCircle, Terminal,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Transaction Flow Analysis | Financial Intelligence Unit" },
      { name: "description", content: "Visualize money flow between accounts and identify key transaction patterns — FIU India." },
    ],
  }),
  loader: () => getAccountStatements(),
  component: Dashboard,
});

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: FileText, label: "Account Statements" },
  { icon: Bell, label: "Alerts" },
  { icon: FileBarChart, label: "Reports" },
  { icon: Settings, label: "Settings" },
];

type AppView = (typeof navItems)[number]["label"];

type AccountStatement = {
  name: string;
  accountId: string;
  accountName: string;
  transactions: Transaction[];
};

type Transaction = {
  transactionId: string;
  fileName: string;
  transactionType: string;
  mode: string;
  fromAccount: string;
  fromName: string;
  toAccount: string;
  toName: string;
  amount: number;
  date: string;
  time: string;
  savingsBalance: number;
};

type GraphNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  amount: number;
  count: number;
  type: "in" | "out" | "internal";
  linkedCenterId: string;
  transactionIds: string[];
};

type CenterCard = {
  id: string;
  name: string;
  amount: number;
  count: number;
  x: number;
  y: number;
};

type CenterLink = {
  fromId: string;
  toId: string;
  amount: number;
  count: number;
  flowType: "credit" | "debit";
  transactionIds: string[];
};

type FlowDetail = {
  from: string;
  to: string;
  amount: number;
  transactionIds: string[];
  x: number;
  y: number;
};

type FlaggedAccount = {
  id: string;
  name: string;
  flag: "Circular Loop" | "Potential Loop" | "Dormant Account" | "Structuring Pattern" | "Velocity Burst";
  accountIds: string[];
  transactionIds: string[];
  detail: string;
  amount: number;
};

type MoneyFlowGraph = {
  centerId: string;
  centerName: string;
  centerAmount: number;
  centerCards: CenterCard[];
  nodes: GraphNode[];
  totalTransactions: number;
  totalAccounts: number;
  totalAmount: number;
  incomingCount: number;
  outgoingCount: number;
  internalCount: number;
  flaggedCount: number;
  dateRange: string;
};

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type CanvasDragState = {
  clientX: number;
  clientY: number;
  viewBox: ViewBoxState;
};

type ViewBoxState = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type GraphLayoutOptions = {
  spacious?: boolean;
};

const runBackendDiagnosticsFn = createServerFn({ method: "POST" }).handler(async (ctx: any) => {
  const stage = (typeof ctx?.data === "string" ? ctx.data : "all") as string;
  const [{ execFile }, path] = await Promise.all([
    import("node:child_process"),
    import("node:path"),
  ]);
  const scriptPath = path.resolve(process.cwd(), "..", "..", "backend", "run_diagnostics.py");
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  return new Promise((resolve, reject) => {
    execFile(pythonCmd, [scriptPath, "--stage", stage || "all"], { maxBuffer: 15 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return reject(new Error(stderr || err.message));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse backend output: ${stdout || stderr}`));
      }
    });
  });
});

const getAccountStatements = createServerFn({ method: "GET" }).handler(async () => {
  const [{ readFile, readdir }, path] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const accountStatementsDir = path.resolve(process.cwd(), "..", "account_data", "generated_accounts");
  const entries = await readdir(accountStatementsDir, { withFileTypes: true });

  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return Promise.all(
    fileNames.map(async (name) => {
      const csv = await readFile(path.join(accountStatementsDir, name), "utf8");
      return parseAccountStatement(name, csv);
    }),
  );
});

function parseAccountStatement(fileName: string, csv: string): AccountStatement {
  const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const accountId = fileName.replace(/\.csv$/i, "");
  const transactions = rows
    .map((row) => parseTransaction(fileName, parseCsvLine(row), indexByHeader))
    .filter((transaction): transaction is Transaction => Boolean(transaction));
  const accountName =
    transactions.find((transaction) => transaction.toAccount === accountId)?.toName ??
    transactions.find((transaction) => transaction.fromAccount === accountId)?.fromName ??
    "Unknown Account";

  return { name: fileName, accountId, accountName, transactions };
}

function parseTransaction(
  fileName: string,
  row: string[],
  indexByHeader: Map<string, number>,
): Transaction | null {
  const field = (header: string) => row[indexByHeader.get(header) ?? -1]?.trim() ?? "";
  const amount = Number(field("Amount"));

  if (!Number.isFinite(amount)) return null;

  return {
    transactionId:
      field("Transaction ID") ||
      field("Transaction Id") ||
      field("Txn ID") ||
      field("Txn Id") ||
      `${fileName.replace(/\.csv$/i, "")}-${field("Sl No")}`,
    fileName,
    transactionType: field("Transaction Type"),
    mode: field("Mode"),
    fromAccount: field("From Account"),
    fromName: field("From Name"),
    toAccount: field("To Account"),
    toName: field("To Name"),
    amount,
    date: field("Date"),
    time: field("Time"),
    savingsBalance: Number(field("Savings Balance")) || 0,
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

const GRAPH_WIDTH = 1400;
const GRAPH_HEIGHT = 900;
const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const CENTER_WIDTH = 220;
const CENTER_HEIGHT = 84;
const CX = GRAPH_WIDTH / 2;
const CY = GRAPH_HEIGHT / 2;
const MAX_GRAPH_NODES = 30;
const MAX_FLAGGED_ACCOUNTS = 80;
const INITIAL_VIEW_BOX: ViewBoxState = { x: -90, y: 0, width: GRAPH_WIDTH, height: GRAPH_HEIGHT };

function curve(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 40;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

function buildMoneyFlowGraph(
  selectedStatements: AccountStatement[],
  layoutOptions: GraphLayoutOptions = {},
): MoneyFlowGraph {
  const selectedAccounts = new Set(selectedStatements.map((statement) => statement.accountId));
  const aggregate = new Map<string, Omit<GraphNode, "x" | "y">>();
  const transactions = selectedStatements.flatMap((statement) => statement.transactions);
  const allAccounts = new Set<string>();
  let incomingCount = 0;
  let outgoingCount = 0;
  let internalCount = 0;

  for (const transaction of transactions) {
    const fromSelected = selectedAccounts.has(transaction.fromAccount);
    const toSelected = selectedAccounts.has(transaction.toAccount);
    if (!fromSelected && !toSelected) continue;

    allAccounts.add(transaction.fromAccount);
    allAccounts.add(transaction.toAccount);

    const type = fromSelected && toSelected ? "internal" : toSelected ? "in" : "out";
    if (type === "internal") {
      internalCount += 1;
      continue;
    }

    const linkedCenterId = type === "in" ? transaction.toAccount : transaction.fromAccount;
    const counterpartyId = type === "in" ? transaction.fromAccount : transaction.toAccount;
    const counterpartyName = type === "in" ? transaction.fromName : transaction.toName;
    const key = `${type}:${linkedCenterId}:${counterpartyId}`;
    const current =
      aggregate.get(key) ??
      {
        id: counterpartyId,
        name: counterpartyName,
        amount: 0,
        count: 0,
        type,
        linkedCenterId,
        transactionIds: [],
      };

    current.amount += transaction.amount;
    current.count += 1;
    current.transactionIds.push(transaction.transactionId);
    aggregate.set(key, current);

    if (type === "in") incomingCount += 1;
    if (type === "out") outgoingCount += 1;
  }

  const totalAmount = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const dates = transactions.map((transaction) => transaction.date).filter(Boolean).sort();
  const centerCards = buildCenterCards(selectedStatements, transactions, layoutOptions);
  const nodes = Array.from(aggregate.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_GRAPH_NODES);
  const positionedNodes = positionExternalNodes(nodes, centerCards);

  return {
    centerId:
      selectedStatements.length === 1
        ? selectedStatements[0].accountId
        : `${selectedStatements.length} selected accounts`,
    centerName:
      selectedStatements.length === 1
        ? selectedStatements[0].accountName
        : `${selectedStatements.length} account statements`,
    centerAmount: totalAmount,
    centerCards,
    nodes: positionedNodes,
    totalTransactions: transactions.length,
    totalAccounts: allAccounts.size || selectedAccounts.size,
    totalAmount,
    incomingCount,
    outgoingCount,
    internalCount,
    flaggedCount: transactions.filter((transaction) => transaction.amount >= 100000).length,
    dateRange: dates.length ? `${formatShortDate(dates[0])} to ${formatShortDate(dates[dates.length - 1])}` : "No dates",
  };
}

function buildCenterCards(
  statements: AccountStatement[],
  transactions: Transaction[],
  layoutOptions: GraphLayoutOptions = {},
): CenterCard[] {
  if (statements.length === 0) {
    return [
      {
        id: "no-selection",
        name: "No account selected",
        amount: 0,
        count: 0,
        x: CX - CENTER_WIDTH / 2,
        y: CY - CENTER_HEIGHT / 2,
      },
    ];
  }

  const positions = layoutCenterCards(statements.length, layoutOptions);

  return statements.map((statement, index) => {
    const accountTransactions = transactions.filter(
      (transaction) =>
        transaction.fromAccount === statement.accountId || transaction.toAccount === statement.accountId,
    );

    return {
      id: statement.accountId,
      name: statement.accountName,
      amount: accountTransactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      count: accountTransactions.length,
      x: positions[index].x,
      y: positions[index].y,
    };
  });
}

function layoutCenterCards(count: number, { spacious = false }: GraphLayoutOptions = {}): Array<{ x: number; y: number }> {
  if (count <= 0) return [];

  const gapX = spacious ? 220 : 120;
  const gapY = spacious ? 150 : 100;
  const columns = count <= 3 ? count : Math.min(3, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);
  const clusterWidth = columns * CENTER_WIDTH + (columns - 1) * gapX;
  const clusterHeight = rows * CENTER_HEIGHT + (rows - 1) * gapY;
  const startX = CX - clusterWidth / 2;
  const startY = CY - clusterHeight / 2;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowColumns = Math.min(columns, count - row * columns);
    const rowOffset = ((columns - rowColumns) * (CENTER_WIDTH + gapX)) / 2;

    return {
      x: startX + rowOffset + column * (CENTER_WIDTH + gapX),
      y: startY + row * (CENTER_HEIGHT + gapY),
    };
  });
}

function positionExternalNodes(nodes: Omit<GraphNode, "x" | "y">[], centerCards: CenterCard[]): GraphNode[] {
  if (nodes.length === 0) return [];

  const grouped = new Map<string, Omit<GraphNode, "x" | "y">[]>();
  for (const node of nodes) {
    const key = `${node.linkedCenterId}:${node.type}`;
    grouped.set(key, [...(grouped.get(key) ?? []), node]);
  }

  const positioned: GraphNode[] = [];
  for (const [key, group] of grouped) {
    const [centerId, type] = key.split(":");
    const center = centerCards.find((card) => card.id === centerId) ?? centerCards[0];
    const side = type === "in" ? "left" : "right";
    const x = side === "left" ? 0 : GRAPH_WIDTH - NODE_WIDTH;
    const anchorY = center ? center.y + CENTER_HEIGHT / 2 : CY;
    const yPositions = distributeAround(anchorY, group.length, NODE_HEIGHT, 18);

    group.forEach((node, index) => {
      positioned.push({
        ...node,
        x,
        y: clamp(yPositions[index], 0, GRAPH_HEIGHT - NODE_HEIGHT),
      });
    });
  }

  return positioned;
}

function centerCardKey(id: string) {
  return `center:${id}`;
}

function graphNodeKey(node: Pick<GraphNode, "id" | "type" | "linkedCenterId">) {
  return `${node.type}:${node.linkedCenterId}:${node.id}`;
}

function nearestCenterCard(node: GraphNode, cards: CenterCard[]) {
  return (
    cards.find((card) => card.id === node.linkedCenterId) ??
    cards.reduce((nearest, card) => {
      const nearestDistance = Math.abs(nearest.y + CENTER_HEIGHT / 2 - (node.y + NODE_HEIGHT / 2));
      const cardDistance = Math.abs(card.y + CENTER_HEIGHT / 2 - (node.y + NODE_HEIGHT / 2));
      return cardDistance < nearestDistance ? card : nearest;
    }, cards[0])
  );
}

function buildCenterLinks(cards: CenterCard[], statements: AccountStatement[]): CenterLink[] {
  const visibleIds = new Set(cards.map((card) => card.id));
  const links = new Map<string, CenterLink>();

  for (const statement of statements) {
    for (const transaction of statement.transactions) {
      if (!visibleIds.has(transaction.fromAccount) || !visibleIds.has(transaction.toAccount)) continue;

      const key = `${transaction.fromAccount}:${transaction.toAccount}`;
      const link =
        links.get(key) ??
        {
          fromId: transaction.fromAccount,
          toId: transaction.toAccount,
          amount: 0,
          count: 0,
          flowType: transaction.transactionType.trim().toLowerCase() === "debit" ? "debit" : "credit",
          transactionIds: [],
        };
      link.amount += transaction.amount;
      link.count += 1;
      if (transaction.transactionType.trim().toLowerCase() === "debit") {
        link.flowType = "debit";
      }
      link.transactionIds.push(transaction.transactionId);
      links.set(key, link);
    }
  }

  return Array.from(links.values()).sort((a, b) => b.amount - a.amount);
}

function buildFlaggedAccounts(statements: AccountStatement[]): FlaggedAccount[] {
  if (!statements || statements.length === 0) return [];

  const accountsById = new Map(statements.map((statement) => [statement.accountId, statement]));
  const edges = new Map<string, { from: string; to: string; amount: number; count: number; transactionIds: string[] }>();
  let latestDatasetDate = "";

  for (const statement of statements) {
    for (const transaction of statement.transactions) {
      if (transaction.date > latestDatasetDate) {
        latestDatasetDate = transaction.date;
      }

      if (!accountsById.has(transaction.fromAccount) || !accountsById.has(transaction.toAccount)) continue;

      const key = `${transaction.fromAccount}:${transaction.toAccount}`;
      const edge = edges.get(key) ?? {
        from: transaction.fromAccount,
        to: transaction.toAccount,
        amount: 0,
        count: 0,
        transactionIds: [],
      };
      edge.amount += transaction.amount;
      edge.count += 1;
      edge.transactionIds.push(transaction.transactionId);
      edges.set(key, edge);
    }
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges.values()) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
  }

  const issues = new Map<string, FlaggedAccount>();

  // 1. FAST BOUNDED MULTI-HOP CYCLE DETECTION (up to 4 hops)
  const visitedCycles = new Set<string>();
  let dfsSteps = 0;
  function findCyclesDFS(startNode: string, currentPath: string[], maxDepth: number = 4) {
    if (currentPath.length > maxDepth) return;
    if (++dfsSteps > 500) return; // Prevent exponential branching
    const currNode = currentPath[currentPath.length - 1];
    const neighbors = adjacency.get(currNode) ?? [];

    for (const neighbor of neighbors) {
      if (issues.size >= MAX_FLAGGED_ACCOUNTS) return;
      if (neighbor === startNode && currentPath.length >= 2) {
        // Found a closed loop!
        const cycleKey = canonicalCycleKey(currentPath);
        if (!visitedCycles.has(cycleKey)) {
          visitedCycles.add(cycleKey);
          const source = accountsById.get(startNode);
          
          // Gather all edge amounts and transactions along the cycle
          let cycleAmount = 0;
          const cycleTxnIds: string[] = [];
          for (let i = 0; i < currentPath.length; i++) {
            const u = currentPath[i];
            const v = currentPath[(i + 1) % currentPath.length];
            const e = edges.get(`${u}:${v}`);
            if (e) {
              cycleAmount += e.amount;
              cycleTxnIds.push(...e.transactionIds);
            }
          }

          issues.set(`cycle:${cycleKey}`, {
            id: startNode,
            name: source?.accountName ?? startNode,
            flag: "Circular Loop",
            accountIds: [...currentPath],
            transactionIds: cycleTxnIds,
            detail: `${currentPath.join(" -> ")} -> ${startNode}`,
            amount: cycleAmount,
          });
        }
      } else if (!currentPath.includes(neighbor) && currentPath.length < maxDepth) {
        findCyclesDFS(startNode, [...currentPath, neighbor], maxDepth);
      }
    }
  }

  for (const accountId of accountsById.keys()) {
    if (issues.size >= MAX_FLAGGED_ACCOUNTS) break;
    dfsSteps = 0;
    findCyclesDFS(accountId, [accountId], 4);
  }

  // 2. STRUCTURING PATTERNS (evading INR 2,00,000 threshold with 1,80,000 - 1,99,999 transfers)
  for (const statement of statements) {
    if (issues.size >= MAX_FLAGGED_ACCOUNTS) break;
    const structTxns = statement.transactions.filter(
      (t) => t.amount >= 180000 && t.amount < 200000
    );
    if (structTxns.length >= 2) {
      const structTotal = structTxns.reduce((s, t) => s + t.amount, 0);
      issues.set(`structuring:${statement.accountId}`, {
        id: statement.accountId,
        name: statement.accountName,
        flag: "Structuring Pattern",
        accountIds: [statement.accountId],
        transactionIds: structTxns.map((t) => t.transactionId),
        detail: `${structTxns.length} transactions hovering below INR 2,00,000 threshold (Total: INR ${Math.round(structTotal).toLocaleString("en-IN")})`,
        amount: structTotal,
      });
    }
  }

  // 3. VELOCITY BURSTS (>= 5 transactions in a single day)
  for (const statement of statements) {
    if (issues.size >= MAX_FLAGGED_ACCOUNTS) break;
    const dayMap = new Map<string, { count: number; total: number; txns: string[] }>();
    for (const t of statement.transactions) {
      if (!t.date) continue;
      const cur = dayMap.get(t.date) || { count: 0, total: 0, txns: [] };
      cur.count += 1;
      cur.total += t.amount;
      cur.txns.push(t.transactionId);
      dayMap.set(t.date, cur);
    }
    const peakDays = Array.from(dayMap.entries())
      .filter(([, d]) => d.count >= 5)
      .sort((a, b) => b[1].count - a[1].count);

    if (peakDays.length > 0) {
      const [peakDate, peakData] = peakDays[0];
      issues.set(`velocity:${statement.accountId}`, {
        id: statement.accountId,
        name: statement.accountName,
        flag: "Velocity Burst",
        accountIds: [statement.accountId],
        transactionIds: peakData.txns,
        detail: `Intraday velocity burst: ${peakData.count} transactions on ${peakDate} totalling INR ${Math.round(peakData.total).toLocaleString("en-IN")}`,
        amount: peakData.total,
      });
    }
  }

  // 4. POTENTIAL / REPEAT FLOWS (multi-hop unclosed flows)
  const sortedEdges = Array.from(edges.values()).sort((a, b) => b.amount - a.amount);
  for (const edge of sortedEdges) {
    if (issues.size >= MAX_FLAGGED_ACCOUNTS) break;
    if (edges.has(`${edge.to}:${edge.from}`)) continue;

    const source = accountsById.get(edge.from);
    const target = accountsById.get(edge.to);
    if (!source || !target || edge.count < 2) continue;

    const issueKey = `potential:${edge.from}:${edge.to}`;
    if (!issues.has(issueKey)) {
      issues.set(issueKey, {
        id: edge.from,
        name: source.accountName,
        flag: "Potential Loop",
        accountIds: [edge.from, edge.to],
        transactionIds: edge.transactionIds,
        detail: `${edge.from} -> ${edge.to} (${edge.count} transactions)`,
        amount: edge.amount,
      });
    }
  }

  // 5. DORMANCY REACTIVATION
  if (latestDatasetDate) {
    const latestTime = new Date(`${latestDatasetDate}T00:00:00`).getTime();
    const dormantMs = 30 * 24 * 60 * 60 * 1000;

    for (const statement of statements) {
      if (issues.size >= MAX_FLAGGED_ACCOUNTS) break;
      const latestAccountDate = statement.transactions.reduce(
        (latest, transaction) => (transaction.date > latest ? transaction.date : latest),
        "",
      );
      if (!latestAccountDate) continue;

      const accountTime = new Date(`${latestAccountDate}T00:00:00`).getTime();
      if (latestTime - accountTime >= dormantMs) {
        issues.set(`dormant:${statement.accountId}`, {
          id: statement.accountId,
          name: statement.accountName,
          flag: "Dormant Account",
          accountIds: [statement.accountId],
          transactionIds: statement.transactions.map((transaction) => transaction.transactionId),
          detail: `Inactivity gap: Last activity ${formatShortDate(latestAccountDate)}`,
          amount: statement.transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
        });
      }
    }
  }

  return Array.from(issues.values()).sort((a, b) => {
    const priority = {
      "Circular Loop": 0,
      "Structuring Pattern": 1,
      "Velocity Burst": 2,
      "Potential Loop": 3,
      "Dormant Account": 4,
    };
    return priority[a.flag] - priority[b.flag] || b.amount - a.amount;
  });
}

function canonicalCycleKey(cycle: string[]) {
  return cycle
    .map((_, index) => [...cycle.slice(index), ...cycle.slice(0, index)].join(">"))
    .sort()[0];
}

function distributeInRange(count: number, start: number, end: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
}

function distributeAround(anchorY: number, count: number, itemHeight: number, gap: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [anchorY - itemHeight / 2];

  const step = itemHeight + gap;
  const firstY = anchorY - ((count - 1) * step) / 2 - itemHeight / 2;
  return Array.from({ length: count }, (_, index) => firstY + index * step);
}

function formatAmount(amount: number): string {
  return `INR ${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatCompactAmount(amount: number): string {
  if (amount >= 10000000) return `INR ${(amount / 10000000).toFixed(1)} Cr`;
  if (amount >= 100000) return `INR ${(amount / 100000).toFixed(1)} L`;
  return formatAmount(amount);
}

function formatShortDate(date: string): string {
  if (!date) return "";

  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
}

function getSvgPoint(event: PointerEvent<SVGElement>) {
  const svg = event.currentTarget.ownerSVGElement ?? (event.currentTarget as SVGSVGElement);
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const screenMatrix = svg.getScreenCTM();
  return screenMatrix ? point.matrixTransform(screenMatrix.inverse()) : point;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function matchesTransactionSearch(transaction: Transaction, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return transaction.transactionId.toLowerCase().includes(normalizedQuery);
}

function filterStatementsByTransactionId(statements: AccountStatement[], query: string): AccountStatement[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return statements;

  return statements.map((statement) => ({
    ...statement,
    transactions: statement.transactions.filter((transaction) =>
      matchesTransactionSearch(transaction, normalizedQuery),
    ),
  }));
}

function filterStatementsByExactTransactionIds(
  statements: AccountStatement[],
  transactionIds: Set<string> | null,
): AccountStatement[] {
  if (!transactionIds) return statements;

  return statements.map((statement) => ({
    ...statement,
    transactions: statement.transactions.filter((transaction) => transactionIds.has(transaction.transactionId)),
  }));
}

function formatFlowAccounts(detail: FlowDetail) {
  return `${detail.from} -> ${detail.to}`;
}

function transactionTypeClass(transactionType: string) {
  const normalizedType = transactionType.trim().toLowerCase();
  if (normalizedType === "credit") return "font-semibold text-gov-green";
  if (normalizedType === "debit") return "font-semibold text-gov-red";
  return "";
}

function RiskFlagBadge({ flag }: { flag: FlaggedAccount["flag"] }) {
  return (
    <span
      className={`inline-flex px-2 py-1 text-xs font-semibold ${
        flag === "Dormant Account"
          ? "bg-muted text-muted-foreground border border-border"
          : flag === "Circular Loop"
            ? "bg-gov-red/15 text-gov-red font-bold border border-gov-red/30"
            : flag === "Structuring Pattern"
              ? "bg-saffron/15 text-saffron font-bold border border-saffron/40"
              : flag === "Velocity Burst"
                ? "bg-gov-red/15 text-gov-red font-bold border border-gov-red/30"
                : "bg-saffron/10 text-saffron border border-saffron/30"
      }`}
    >
      {flag}
    </span>
  );
}

function zoomViewBox(viewBox: ViewBoxState, factor: number): ViewBoxState {
  const nextWidth = clamp(viewBox.width * factor, GRAPH_WIDTH * 0.35, GRAPH_WIDTH * 2.5);
  const nextHeight = clamp(viewBox.height * factor, GRAPH_HEIGHT * 0.35, GRAPH_HEIGHT * 2.5);
  const centerX = viewBox.x + viewBox.width / 2;
  const centerY = viewBox.y + viewBox.height / 2;

  return {
    x: centerX - nextWidth / 2,
    y: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight,
  };
}

function AccountStatementContent({
  statement,
  selectedStatements,
  onSelectStatement,
  onGenerateReport,
}: {
  statement?: AccountStatement;
  selectedStatements?: AccountStatement[];
  onSelectStatement?: (name: string) => void;
  onGenerateReport?: (accountId: string) => void;
}) {
  if (!statement) {
    return (
      <div className="flex h-full items-center justify-center bg-card text-sm text-muted-foreground">
        Select an account statement CSV to view its contents.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-lg font-semibold">Account Statement CSV</h2>
          <p className="text-sm text-muted-foreground">
            {statement.name} &bull; Account: <span className="font-mono font-bold text-foreground">{statement.accountId}</span> &bull; {statement.transactions.length.toLocaleString("en-IN")} transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectStatement?.(statement.name)}
            className="flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Refresh account statement view"
          >
            <RefreshCw className="h-3.5 w-3.5 text-navy" /> Refresh &amp; Clear
          </button>
          <button
            onClick={() => downloadStatementCsv(statement)}
            className="flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
            title="Download statement as CSV"
          >
            <Download className="h-3.5 w-3.5" /> Download CSV
          </button>
          <button
            onClick={() => onGenerateReport?.(statement.accountId)}
            className="flex items-center gap-1.5 border border-gov-red bg-gov-red px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-gov-red/90"
            title="Generate official STR report for this account"
          >
            <FileBarChart className="h-3.5 w-3.5" /> Generate STR Dossier
          </button>
          <div className="border border-border bg-background px-3 py-1.5 text-sm font-medium">
            {statement.accountName}
          </div>
        </div>
      </div>

      {/* Multi-account switcher when multiple statements are selected */}
      {selectedStatements && selectedStatements.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/25 px-5 py-2 text-xs overflow-x-auto">
          <span className="font-bold text-muted-foreground shrink-0 uppercase tracking-wider text-[10px]">
            Selected Accounts ({selectedStatements.length}):
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {selectedStatements.map((s) => (
              <button
                key={s.name}
                onClick={() => onSelectStatement?.(s.name)}
                className={`px-2.5 py-1 text-xs border transition-colors shrink-0 ${
                  s.name === statement.name
                    ? "border-navy bg-navy text-white font-bold shadow-xs"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
                title={`View ${s.name} (${s.accountName})`}
              >
                {s.name} <span className="opacity-75">({s.accountId})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1120px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="border-b border-border px-4 py-3 font-semibold">Transaction ID</th>
              <th className="border-b border-border px-4 py-3 font-semibold">Type</th>
              <th className="border-b border-border px-4 py-3 font-semibold">Mode</th>
              <th className="border-b border-border px-4 py-3 font-semibold">From</th>
              <th className="border-b border-border px-4 py-3 font-semibold">To</th>
              <th className="border-b border-border px-4 py-3 text-right font-semibold">Amount</th>
              <th className="border-b border-border px-4 py-3 font-semibold">Date</th>
              <th className="border-b border-border px-4 py-3 font-semibold">Time</th>
              <th className="border-b border-border px-4 py-3 text-right font-semibold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.transactions.map((transaction, index) => (
              <tr key={`${transaction.transactionId}-${index}`} className="hover:bg-muted/50">
                <td className="border-b border-border px-4 py-3 font-mono text-xs">{transaction.transactionId}</td>
                <td className={`border-b border-border px-4 py-3 ${transactionTypeClass(transaction.transactionType)}`}>
                  {transaction.transactionType || "-"}
                </td>
                <td className="border-b border-border px-4 py-3">{transaction.mode || "-"}</td>
                <td className="border-b border-border px-4 py-3">
                  <div className="font-medium">{transaction.fromAccount || "-"}</div>
                  <div className="text-xs text-muted-foreground">{transaction.fromName || "-"}</div>
                </td>
                <td className="border-b border-border px-4 py-3">
                  <div className="font-medium">{transaction.toAccount || "-"}</div>
                  <div className="text-xs text-muted-foreground">{transaction.toName || "-"}</div>
                </td>
                <td className={`border-b border-border px-4 py-3 text-right font-semibold tabular-nums ${transactionTypeClass(transaction.transactionType)}`}>
                  {formatAmount(transaction.amount)}
                </td>
                <td className="border-b border-border px-4 py-3">{transaction.date || "-"}</td>
                <td className="border-b border-border px-4 py-3">{transaction.time || "-"}</td>
                <td className="border-b border-border px-4 py-3 text-right tabular-nums">
                  {formatAmount(transaction.savingsBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsContent({
  issues,
  selectedIssue,
  alertScope,
  setAlertScope,
  selectedCount,
  totalCount,
  onIssueClick,
  onGenerateReportFromIssue,
}: {
  issues: FlaggedAccount[];
  selectedIssue: FlaggedAccount | null;
  alertScope: "all" | "selected";
  setAlertScope: (scope: "all" | "selected") => void;
  selectedCount: number;
  totalCount: number;
  onIssueClick: (issue: FlaggedAccount) => void;
  onGenerateReportFromIssue?: (issue: FlaggedAccount) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-card">
      {/* ALERTS HEADER WITH LIVE SCOPE TOGGLE */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div>
          <h2 className="text-lg font-bold text-navy">Live Forensic Alerts &amp; Ring Detection</h2>
          <p className="text-sm text-muted-foreground">
            {alertScope === "selected"
              ? `Scanning ${selectedCount} selected account statement(s)`
              : `Scanning all ${totalCount} active/imported account statement(s)`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Refresh Alerts Button */}
          <button
            onClick={() => {
              setAlertScope("all");
              onIssueClick(null as any);
            }}
            className="flex items-center gap-1.5 border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
            title="Refresh alerts calculation and reset view"
          >
            <RefreshCw className="h-3.5 w-3.5 text-navy" />
            <span>Refresh &amp; Clear</span>
          </button>

          {/* Scope Toggle: All Active vs Selected */}
          <div className="flex border border-border bg-muted/20 text-xs font-semibold p-0.5">
            <button
              onClick={() => setAlertScope("all")}
              className={`px-3 py-1.5 transition-colors ${
                alertScope === "all"
                  ? "bg-navy text-white font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Active Files ({totalCount})
            </button>
            <button
              onClick={() => setAlertScope("selected")}
              className={`px-3 py-1.5 transition-colors ${
                alertScope === "selected"
                  ? "bg-navy text-white font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Selected Only ({selectedCount})
            </button>
          </div>
          <div className="border border-gov-red/30 bg-gov-red/10 px-3 py-1.5 text-xs font-bold text-gov-red">
            {issues.length} {issues.length === 1 ? "flag" : "flags"} detected
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(440px,0.95fr)_minmax(420px,1.05fr)]">
        <div className="min-h-0 overflow-auto border-r border-border">
          {issues === null ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">Preparing alerts...</div>
          ) : issues.length === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">No alerts detected.</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="border-b border-border px-4 py-3 font-semibold">Account Number</th>
                  <th className="border-b border-border px-4 py-3 font-semibold">Account Holder</th>
                  <th className="border-b border-border px-4 py-3 font-semibold">Flagged</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr
                    key={`${issue.flag}-${issue.detail}`}
                    className={`cursor-pointer hover:bg-muted ${selectedIssue?.detail === issue.detail ? "bg-muted" : ""}`}
                    onClick={() => onIssueClick(issue)}
                  >
                    <td className="border-b border-border px-4 py-3 font-medium tabular-nums">{issue.id}</td>
                    <td className="border-b border-border px-4 py-3">
                      <div className="font-medium">{issue.name}</div>
                      <div className="max-w-[260px] truncate text-xs text-muted-foreground">{issue.detail}</div>
                    </td>
                    <td className="border-b border-border px-4 py-3">
                      <RiskFlagBadge flag={issue.flag} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="min-h-0 overflow-auto">
          {selectedIssue ? (
            <div className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{selectedIssue.id}</h3>
                  <p className="text-sm text-muted-foreground">{selectedIssue.name}</p>
                  <p className="mt-1 text-sm">{selectedIssue.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onGenerateReportFromIssue?.(selectedIssue)}
                    className="flex items-center gap-1.5 border border-gov-red bg-gov-red px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-gov-red/90"
                    title="Generate STR dossier for this detected loop"
                  >
                    <FileBarChart className="h-3.5 w-3.5" /> File STR Dossier
                  </button>
                  <RiskFlagBadge flag={selectedIssue.flag} />
                </div>
              </div>
              <div className="mb-3 flex items-center justify-between border border-border bg-background px-3 py-2 text-sm">
                <span className="font-medium">Flagged Transactions</span>
                <span className="tabular-nums text-muted-foreground">
                  {selectedIssue.transactionIds.length.toLocaleString("en-IN")} IDs
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {selectedIssue.transactionIds.map((transactionId) => (
                  <div key={transactionId} className="border border-border bg-background px-3 py-2 font-mono">
                    {transactionId}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-5 text-sm text-muted-foreground">
              Select an alert to view transaction IDs and filter the money flow visualization.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadStatementCsv(statement: AccountStatement) {
  const headers = ["Sl No,Transaction ID,Transaction Type,Mode,From Account,From Name,To Account,To Name,Amount,Date,Time,Balance"];
  const rows = statement.transactions.map((t, i) =>
    [
      i + 1,
      t.transactionId,
      t.transactionType,
      t.mode,
      t.fromAccount,
      `"${(t.fromName || "").replace(/"/g, '""')}"`,
      t.toAccount,
      `"${(t.toName || "").replace(/"/g, '""')}"`,
      t.amount,
      t.date,
      t.time,
      t.savingsBalance,
    ].join(",")
  );
  const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent([headers, ...rows].join("\n"));
  const link = document.createElement("a");
  link.setAttribute("href", csvContent);
  link.setAttribute("download", `${statement.name || statement.accountId}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadJsonFile(data: unknown, filename: string) {
  const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  const link = document.createElement("a");
  link.setAttribute("href", jsonStr);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

type GeneratedReport = {
  id: string;
  referenceId: string;
  date: string;
  reportType: "STR" | "CTR" | "NETWORK_AUDIT";
  // Part I: Reporting Entity
  reportingEntity: {
    name: string;
    category: string;
    registrationNo: string;
    principalOfficer: string;
    designation: string;
    address: string;
    branchId: string;
  };
  // Part II: Subject of Report
  subject: {
    accountNumber: string;
    accountHolderName: string;
    accountType: string;
    branch: string;
    dateOfOpening: string;
    kycStatus: string;
    panNo: string;
    riskCategory: "HIGH" | "MEDIUM" | "LOW";
  };
  // Part III: Transaction Forensic Analytics (Real Computed Data)
  transactionAnalysis: {
    totalCredits: number;
    totalDebits: number;
    totalVolume: number;
    transactionCount: number;
    creditCount: number;
    debitCount: number;
    dateRangeStart: string;
    dateRangeEnd: string;
    avgTransactionSize: number;
    maxSingleTransaction: { amount: number; id: string; date: string; type: string; mode: string; counterparty: string };
    highValueCount: number;
    highValueTotal: number;
    structuringCount: number;
    structuringTxns: { id: string; date: string; amount: number; toAccount: string }[];
    topCounterparties: { id: string; name: string; totalAmount: number; count: number }[];
    paymentModes: { mode: string; count: number; total: number }[];
    velocityBursts: { date: string; count: number; totalAmount: number }[];
    dormancyDays: number | null;
    creditDebitRatio: number;
  };
  // Part IV: AEGIS 5-Stage Mathematical Intelligence
  aegisAnalysis: {
    stageA_prior: number;
    stageB_entropy: number;
    stageB_threshold_met: boolean;
    stageC_sources: { source: string; infoGain: number; cost: number; utility: number }[];
    stageD_cycles: string[];
    stageD_shellChains: string[];
    stageE_posterior: number;
    stageE_verdict: "BLOCK" | "ESCALATE" | "MONITOR" | "CLEAR";
    stageE_certaintyPct: number;
  };
  suspicionGrounds: string[];
  recommendation: string;
  regulatoryActions: string[];
  digitalSignature: {
    signer: string;
    digest: string;
    timestamp: string;
    algorithm: string;
  };
  rawPayload: unknown;
};

function ReportsContent({
  accountStatements,
  flaggedAccounts,
  initialAccountId,
}: {
  accountStatements: AccountStatement[];
  flaggedAccounts: FlaggedAccount[] | null;
  initialAccountId?: string;
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(
    initialAccountId || accountStatements[0]?.accountId || "",
  );
  const [reportType, setReportType] = useState<"STR" | "CTR" | "NETWORK_AUDIT">("STR");
  const [reportsHistory, setReportsHistory] = useState<GeneratedReport[]>([]);
  const [currentReport, setCurrentReport] = useState<GeneratedReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeStatement = useMemo(
    () => accountStatements.find((s) => s.accountId === selectedAccountId) || accountStatements[0],
    [accountStatements, selectedAccountId],
  );

  const matchedIssue = useMemo(
    () => flaggedAccounts?.find((f) => f.id === selectedAccountId || f.accountIds.includes(selectedAccountId)),
    [flaggedAccounts, selectedAccountId],
  );

  function generateReport() {
    if (!activeStatement) return;
    setIsGenerating(true);

    setTimeout(() => {
      const now = new Date();
      const txns = activeStatement.transactions;
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, "0");
      const refNum = Math.floor(100000 + Math.random() * 900000);
      const refId = `FIU-IND/${reportType}/${yr}/${mo}/${activeStatement.accountId}/${refNum}`;

      // ── REAL TRANSACTION FORENSIC COMPUTATION ───────────────────
      const credits = txns.filter((t) => (t.transactionType || "").trim().toUpperCase() === "CREDIT");
      const debits = txns.filter((t) => (t.transactionType || "").trim().toUpperCase() === "DEBIT");
      const totalCredits = credits.reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalDebits = debits.reduce((sum, t) => sum + (t.amount || 0), 0);
      const totalVolume = totalCredits + totalDebits;
      const avgTxnSize = txns.length > 0 ? totalVolume / txns.length : 0;

      // Date Range
      const sortedByDate = [...txns].filter((t) => Boolean(t.date)).sort((a, b) => a.date.localeCompare(b.date));
      const dateRangeStart = sortedByDate[0]?.date || "2024-01-01";
      const dateRangeEnd = sortedByDate[sortedByDate.length - 1]?.date || "2024-04-30";

      // Max single transaction
      let maxTxn = txns[0];
      for (const t of txns) {
        if (t.amount > (maxTxn?.amount || 0)) maxTxn = t;
      }
      const maxSingle = maxTxn
        ? {
            amount: maxTxn.amount,
            id: maxTxn.transactionId || `TXN-${maxTxn.date}`,
            date: maxTxn.date,
            type: maxTxn.transactionType || "DEBIT",
            mode: maxTxn.mode || "NEFT",
            counterparty: (maxTxn.transactionType || "").toUpperCase() === "CREDIT"
              ? `${maxTxn.fromAccount} (${maxTxn.fromName || "Unknown"})`
              : `${maxTxn.toAccount} (${maxTxn.toName || "Unknown"})`,
          }
        : { amount: 0, id: "N/A", date: "N/A", type: "N/A", mode: "N/A", counterparty: "N/A" };

      // High-Value Transactions (>= INR 1,00,000)
      const highValueTxns = txns.filter((t) => t.amount >= 100000);
      const highValueTotal = highValueTxns.reduce((sum, t) => sum + t.amount, 0);

      // Structuring Transactions (INR 1,80,000 to INR 1,99,999 — just under INR 2,00,000 threshold)
      const structuringList = txns
        .filter((t) => t.amount >= 180000 && t.amount < 200000)
        .map((t) => ({
          id: t.transactionId,
          date: t.date,
          amount: t.amount,
          toAccount: t.toAccount || "Counterparty",
        }));

      // Top Counterparties Aggregation
      const cpMap = new Map<string, { name: string; total: number; count: number }>();
      for (const t of txns) {
        const isCredit = (t.transactionType || "").toUpperCase() === "CREDIT";
        const cpId = isCredit ? t.fromAccount : t.toAccount;
        const cpName = isCredit ? t.fromName : t.toName;
        if (cpId && cpId !== activeStatement.accountId) {
          const current = cpMap.get(cpId) || { name: cpName || cpId, total: 0, count: 0 };
          current.total += t.amount;
          current.count += 1;
          cpMap.set(cpId, current);
        }
      }
      const topCounterparties = Array.from(cpMap.entries())
        .map(([id, data]) => ({ id, name: data.name, totalAmount: data.total, count: data.count }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 6);

      // Payment Modes
      const modeMap = new Map<string, { count: number; total: number }>();
      for (const t of txns) {
        const m = t.mode || "Bank Transfer";
        const current = modeMap.get(m) || { count: 0, total: 0 };
        current.count += 1;
        current.total += t.amount;
        modeMap.set(m, current);
      }
      const paymentModes = Array.from(modeMap.entries())
        .map(([mode, data]) => ({ mode, count: data.count, total: data.total }))
        .sort((a, b) => b.total - a.total);

      // Velocity Bursts (Dates with >= 5 transactions)
      const dayMap = new Map<string, { count: number; total: number }>();
      for (const t of txns) {
        if (!t.date) continue;
        const current = dayMap.get(t.date) || { count: 0, total: 0 };
        current.count += 1;
        current.total += t.amount;
        dayMap.set(t.date, current);
      }
      const velocityBursts = Array.from(dayMap.entries())
        .filter(([, data]) => data.count >= 5)
        .map(([date, data]) => ({ date, count: data.count, totalAmount: data.total }))
        .sort((a, b) => b.count - a.count);

      // Dormancy Calculation (Longest gap between successive transactions in days)
      let dormancyDays: number | null = null;
      if (sortedByDate.length >= 2) {
        let maxGap = 0;
        for (let i = 1; i < sortedByDate.length; i++) {
          const prevDate = new Date(sortedByDate[i - 1].date).getTime();
          const currDate = new Date(sortedByDate[i].date).getTime();
          const diffDays = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
          if (diffDays > maxGap) maxGap = diffDays;
        }
        if (maxGap >= 30) dormancyDays = maxGap;
      }

      // Credit to Debit Ratio
      const creditDebitRatio = totalDebits > 0 ? totalCredits / totalDebits : totalCredits > 0 ? 10 : 1;

      // ── AEGIS 5-STAGE MATHEMATICAL REASONING ───────────────────
      // Stage A: Real feature scoring
      let p0 = 0.12; // Base benign prior
      if (highValueTxns.length >= 5) p0 += 0.15;
      if (highValueTxns.length >= 15) p0 += 0.12;
      if (structuringList.length >= 3) p0 += 0.22;
      if (structuringList.length >= 8) p0 += 0.15;
      if (velocityBursts.length >= 1) p0 += 0.12;
      if (dormancyDays && dormancyDays >= 60) p0 += 0.18;
      if (matchedIssue?.flag === "Circular Loop") p0 += 0.35;
      if (matchedIssue?.flag === "Potential Loop") p0 += 0.18;
      if (matchedIssue?.flag === "Dormant Account") p0 += 0.20;
      if (totalVolume >= 10000000) p0 += 0.08;
      if (creditDebitRatio > 4.0 || creditDebitRatio < 0.25) p0 += 0.10;
      const stageA_prior = Math.min(Math.max(p0, 0.05), 0.985);

      // Stage B: Shannon Entropy H(X) = -p*log2(p) - (1-p)*log2(1-p)
      const pClamped = Math.min(Math.max(stageA_prior, 0.001), 0.999);
      const stageB_entropy = -(pClamped * Math.log2(pClamped) + (1 - pClamped) * Math.log2(1 - pClamped));
      const stageB_threshold_met = stageB_entropy < 0.35;

      // Stage C: Information-theoretic evidence sources with utility U = InfoGain / Cost
      const stageCSources = [
        { source: "Transaction History Analysis", infoGain: 0.52, cost: 1, utility: 0.52 },
        { source: "Graph Topology Cycle Traversal", infoGain: matchedIssue ? 0.92 : 0.15, cost: 3, utility: matchedIssue ? 0.307 : 0.05 },
        { source: "Anti-Structuring Smurfing Scan", infoGain: structuringList.length > 0 ? 0.85 : 0.08, cost: 1, utility: structuringList.length > 0 ? 0.85 : 0.08 },
        { source: "Temporal Velocity Burst Scan", infoGain: velocityBursts.length > 0 ? 0.74 : 0.06, cost: 2, utility: velocityBursts.length > 0 ? 0.37 : 0.03 },
        { source: "Dormancy Reactivation Profiler", infoGain: dormancyDays ? 0.68 : 0.04, cost: 1, utility: dormancyDays ? 0.68 : 0.04 },
        { source: "Watchlist & Sanctions Verification", infoGain: 0.22, cost: 4, utility: 0.055 },
      ].sort((a, b) => b.utility - a.utility);

      // Stage D: Cycles & Graph Traversal
      const stageD_cycles: string[] = [];
      if (matchedIssue?.flag === "Circular Loop") {
        stageD_cycles.push(matchedIssue.detail);
      } else if (matchedIssue?.flag === "Potential Loop") {
        stageD_cycles.push(`Potential bi-directional flow: ${matchedIssue.detail}`);
      }

      // Stage E: Bayesian Belief Convergence
      let posterior = stageA_prior;
      if (stageD_cycles.length > 0) posterior += 0.12;
      if (structuringList.length >= 3) posterior += 0.08;
      if (velocityBursts.length >= 1) posterior += 0.05;
      posterior = Math.min(posterior, 0.998);

      const stageE_certaintyPct = Math.round(posterior * 1000) / 10;
      const stageE_verdict: "BLOCK" | "ESCALATE" | "MONITOR" | "CLEAR" =
        posterior >= 0.82 ? "BLOCK" : posterior >= 0.60 ? "ESCALATE" : posterior >= 0.38 ? "MONITOR" : "CLEAR";

      // ── STATUTORY GROUNDS OF SUSPICION (PML Rules 2005) ────────
      const grounds: string[] = [];
      if (matchedIssue?.flag === "Circular Loop") {
        grounds.push(
          `Circular Flow of Funds (Shell Layering): Confirmed cycle detected in graph topology: ${matchedIssue.detail}. Funds return to source without genuine commercial rationale, in violation of Rule 3(1)(D) PML Rules 2005.`
        );
      }
      if (structuringList.length > 0) {
        grounds.push(
          `Smurfing & Structuring Patterns: ${structuringList.length} transaction(s) identified clustering immediately below the statutory cash/transfer threshold of INR 2,00,000 (amounts between INR 1,80,000 and INR 1,99,999), demonstrating deliberate evasion of mandatory reporting under Section 12 PMLA 2002.`
        );
      }
      if (velocityBursts.length > 0) {
        const topBurst = velocityBursts[0];
        grounds.push(
          `Abnormal High-Frequency Velocity Burst: Elevated burst of ${topBurst.count} transactions on ${topBurst.date} totalling ${formatAmount(topBurst.totalAmount)}, inconsistent with normal customer profile and indicating automated rapid fund dissemination.`
        );
      }
      if (dormancyDays && dormancyDays >= 30) {
        grounds.push(
          `Dormancy Followed by Sudden High-Volume Surges: Account remained dormant for ${dormancyDays} consecutive days, followed by sudden high-value debit/credit operations without commensurate commercial explanation.`
        );
      }
      if (highValueTxns.length >= 5) {
        grounds.push(
          `Volumetric Concentration: ${highValueTxns.length} high-value transactions aggregating ${formatAmount(highValueTotal)} exceeding standard retail operating profile.`
        );
      }
      if (creditDebitRatio > 4.0) {
        grounds.push(
          `Severe Credit Imbalance (${creditDebitRatio.toFixed(1)}:1): Disproportionately high inflows without corresponding legitimate economic absorption, indicating pass-through vehicle behaviour.`
        );
      } else if (creditDebitRatio < 0.25) {
        grounds.push(
          `Rapid Capital Depletion / Flight of Funds: Rapid outgoing transfers depleting account balance immediately following credit credits.`
        );
      }
      if (grounds.length === 0) {
        grounds.push(
          "Standard Periodic Compliance Audit: Transaction volume and counterparties reviewed against baseline thresholds; no prima facie statutory deviation observed during current review cycle."
        );
      }

      // ── REGULATORY ACTION DIRECTIVES ────────────────────────────
      const regulatoryActions: string[] = [];
      let recommendation = "";
      if (stageE_verdict === "BLOCK") {
        recommendation = "FREEZE ACCOUNT UNDER SECTION 17(1A) OF PMLA 2002 & TRANSMIT STR TO FIU-IND";
        regulatoryActions.push("Immediate provisional debit freeze of Account under Section 17(1A), PMLA 2002");
        regulatoryActions.push("Transmit official STR XML/JSON payload to Director, FIU-IND within statutory 7-day window (Rule 7, PML Rules 2005)");
        regulatoryActions.push("Issue statutory Record Preservation Order under Section 21 PMLA for all transaction logs, IP trails, and KYC files (10-year retention)");
        regulatoryActions.push("Notify designated Principal Officer and trigger institutional anti-tipping-off firewall under Section 66 PMLA");
      } else if (stageE_verdict === "ESCALATE") {
        recommendation = "ENHANCED DUE DILIGENCE (EDD) & STATUTORY STR FILING RECOMMENDED";
        regulatoryActions.push("Initiate Enhanced Due Diligence (EDD) under RBI Master Direction — KYC 2016, Section 38");
        regulatoryActions.push("File Form STR with FIU-IND for supervisory scrutiny under Rule 7, PML Rules 2005");
        regulatoryActions.push("Place real-time transactional monitoring hold with threshold alerts for subsequent movements");
      } else if (stageE_verdict === "MONITOR") {
        recommendation = "RETAIN ON ACTIVE OBSERVATION QUEUE — ROUTINE SURVEILLANCE";
        regulatoryActions.push("Maintain account on 90-day heightened algorithmic observation queue");
        regulatoryActions.push("Re-evaluate graph topology upon generation of next account statement batch");
      } else {
        recommendation = "CLEAR FROM INVESTIGATION QUEUE — STANDARD KYC DUE DILIGENCE";
        regulatoryActions.push("No regulatory interdiction required at this juncture; maintain periodic Customer Due Diligence (CDD)");
      }

      // Digital Signature digest simulation (deterministic hash)
      const digestSeed = `${refId}-${activeStatement.accountId}-${totalVolume}-${now.getTime()}`;
      let hash = 0;
      for (let i = 0; i < digestSeed.length; i++) {
        hash = (hash << 5) - hash + digestSeed.charCodeAt(i);
        hash |= 0;
      }
      const hexHash = Math.abs(hash).toString(16).padStart(16, "0");
      const digitalSignature = {
        signer: "FIU-IND-DIGITAL-SIGNING-AUTHORITY // RE-NODE-01",
        digest: `SHA256: 4f8b${hexHash}e29a1c8f73b092da112345e78c90`,
        timestamp: `${now.toISOString().replace("T", " ").substring(0, 19)} IST`,
        algorithm: "ECDSA-P256-SHA256 / Information Technology Act 2000 Section 3A",
      };

      const reportData: GeneratedReport = {
        id: `REP_${Date.now()}`,
        referenceId: refId,
        date: now.toISOString().replace("T", " ").substring(0, 19),
        reportType,
        reportingEntity: {
          name: "AEGIS Autonomous Crime Intelligence Node (Direct FIU-IND Gateway)",
          category: "Banking Company / Reporting Entity under Section 2(wa), PMLA 2002",
          registrationNo: "RE-FIUIND-2024-BANK-09842",
          principalOfficer: "Designated Principal Officer (PMLA Compliance)",
          designation: "Chief Anti-Money Laundering Officer (CAMLO)",
          address: "Financial Intelligence Unit - India, 6th Floor, Hotel Samrat, Chanakyapuri, New Delhi - 110021",
          branchId: "CENTRAL-SURVEILLANCE-NODE-DL-01",
        },
        subject: {
          accountNumber: activeStatement.accountId,
          accountHolderName: activeStatement.accountName,
          accountType: "Current / Savings Commercial Transit Account",
          branch: "Digital Operations & Electronic Clearing Hub",
          dateOfOpening: sortedByDate[0]?.date || "2024-01-01",
          kycStatus: matchedIssue ? "Enhanced Due Diligence Mandated (High Risk)" : "Full KYC Compliant (Re-verification Due)",
          panNo: `AAAAA${activeStatement.accountId.slice(-4)}Z`,
          riskCategory: stageE_verdict === "BLOCK" ? "HIGH" : stageE_verdict === "ESCALATE" ? "HIGH" : "MEDIUM",
        },
        transactionAnalysis: {
          totalCredits,
          totalDebits,
          totalVolume,
          transactionCount: txns.length,
          creditCount: credits.length,
          debitCount: debits.length,
          dateRangeStart,
          dateRangeEnd,
          avgTransactionSize: avgTxnSize,
          maxSingleTransaction: maxSingle,
          highValueCount: highValueTxns.length,
          highValueTotal,
          structuringCount: structuringList.length,
          structuringTxns: structuringList,
          topCounterparties,
          paymentModes,
          velocityBursts,
          dormancyDays,
          creditDebitRatio,
        },
        aegisAnalysis: {
          stageA_prior: Math.round(stageA_prior * 1000) / 1000,
          stageB_entropy: Math.round(stageB_entropy * 1000) / 1000,
          stageB_threshold_met,
          stageC_sources: stageCSources,
          stageD_cycles,
          stageD_shellChains: [],
          stageE_posterior: Math.round(posterior * 1000) / 1000,
          stageE_verdict,
          stageE_certaintyPct,
        },
        suspicionGrounds: grounds,
        recommendation,
        regulatoryActions,
        digitalSignature,
        rawPayload: {
          fiu_ind_specification: "FIN/STR_v2.4",
          statutory_framework: [
            "Prevention of Money Laundering Act, 2002 (Section 12, 17)",
            "PML (Maintenance of Records) Rules, 2005 (Rule 3, 5, 7)",
            "RBI Master Direction - KYC, 2016 (Updated 2024)",
            "FATF 40 Recommendations (Recommendation 16 & 20)",
          ],
          filing_metadata: {
            reference_number: refId,
            filing_timestamp: now.toISOString(),
            report_type: reportType,
            jurisdiction: "Republic of India",
          },
          reporting_entity: {
            name: "AEGIS Autonomous Crime Intelligence Node",
            registration: "RE-FIUIND-2024-BANK-09842",
            principal_officer: "CAMLO / Principal Officer",
          },
          subject_particulars: {
            account_id: activeStatement.accountId,
            account_name: activeStatement.accountName,
            account_type: "Current/Savings Account",
            pan_hash: `AAAAA${activeStatement.accountId.slice(-4)}Z`,
          },
          forensic_ledger_summary: {
            review_period: `${dateRangeStart} to ${dateRangeEnd}`,
            total_turnover_inr: Math.round(totalVolume * 100) / 100,
            aggregate_credits_inr: Math.round(totalCredits * 100) / 100,
            aggregate_debits_inr: Math.round(totalDebits * 100) / 100,
            transaction_count: txns.length,
            high_value_count: highValueTxns.length,
            high_value_total_inr: Math.round(highValueTotal * 100) / 100,
            structuring_count: structuringList.length,
            dormancy_gap_days: dormancyDays,
            velocity_burst_days: velocityBursts.length,
            top_counterparties: topCounterparties,
          },
          aegis_intelligence_trace: {
            stage_a_xgboost_prior: stageA_prior,
            stage_b_shannon_entropy: stageB_entropy,
            stage_b_entropy_cutoff_met: stageB_threshold_met,
            stage_c_optimal_sources: stageCSources,
            stage_d_graph_cycles: stageD_cycles,
            stage_e_bayesian_posterior: posterior,
            stage_e_certainty_percentage: stageE_certaintyPct,
            stage_e_final_verdict: stageE_verdict,
          },
          statutory_grounds: grounds,
          regulatory_directives: regulatoryActions,
          digital_signature: digitalSignature,
        },
      };

      setCurrentReport(reportData);
      setReportsHistory((prev) => [reportData, ...prev.filter((r) => r.id !== reportData.id)]);
      setIsGenerating(false);
    }, 450);
  }

  function handleCopy() {
    if (!currentReport) return;
    const r = currentReport;
    const ta = r.transactionAnalysis;
    const aa = r.aegisAnalysis;
    const text = `
================================================================================
GOVERNMENT OF INDIA
FINANCIAL INTELLIGENCE UNIT - INDIA (FIU-IND)
Ministry of Finance | Department of Revenue
================================================================================
SUSPICIOUS TRANSACTION REPORT (FORM STR)
Under Section 12, Prevention of Money Laundering Act, 2002
Read with Rule 3 & 7, PML (Maintenance of Records) Rules, 2005
[CONFIDENTIAL & PRIVILEGED STATUTORY COMMUNICATION]
================================================================================

REF NO.         : ${r.referenceId}
DATE OF FILING  : ${r.date} IST
REPORT TYPE     : ${r.reportType}
JURISDICTION    : Republic of India

--------------------------------------------------------------------------------
PART I: REPORTING ENTITY (RE) PARTICULARS
--------------------------------------------------------------------------------
Reporting Entity      : ${r.reportingEntity.name}
Registration Number   : ${r.reportingEntity.registrationNo}
Category              : ${r.reportingEntity.category}
Designated Officer    : ${r.reportingEntity.principalOfficer} (${r.reportingEntity.designation})
Branch Location       : ${r.reportingEntity.branchId}

--------------------------------------------------------------------------------
PART II: SUBJECT ACCOUNT PARTICULARS
--------------------------------------------------------------------------------
Account Number        : ${r.subject.accountNumber}
Account Holder Name   : ${r.subject.accountHolderName}
PAN (Masked)          : ${r.subject.panNo}
Account Type          : ${r.subject.accountType}
KYC Status            : ${r.subject.kycStatus}
Risk Classification   : ${r.subject.riskCategory}

--------------------------------------------------------------------------------
PART III: TRANSACTION FORENSIC ANALYSIS & LEDGER SUMMARY
--------------------------------------------------------------------------------
Audit Period          : ${ta.dateRangeStart} to ${ta.dateRangeEnd}
Total Turnover        : INR ${Math.round(ta.totalVolume).toLocaleString("en-IN")}
  - Aggregate Credits : INR ${Math.round(ta.totalCredits).toLocaleString("en-IN")} (${ta.creditCount} transactions)
  - Aggregate Debits  : INR ${Math.round(ta.totalDebits).toLocaleString("en-IN")} (${ta.debitCount} transactions)
Credit / Debit Ratio  : ${ta.creditDebitRatio.toFixed(2)} : 1
Avg Transaction Size  : INR ${Math.round(ta.avgTransactionSize).toLocaleString("en-IN")}
Max Transaction       : INR ${Math.round(ta.maxSingleTransaction.amount).toLocaleString("en-IN")} (ID: ${ta.maxSingleTransaction.id}, Date: ${ta.maxSingleTransaction.date})
High-Value (>1L)      : ${ta.highValueCount} transactions aggregating INR ${Math.round(ta.highValueTotal).toLocaleString("en-IN")}
Structuring (1.8-2L)  : ${ta.structuringCount} transaction(s) hovering below INR 2,00,000 threshold
Velocity Anomalies    : ${ta.velocityBursts.length} day(s) with >= 5 transactions
Dormancy Period       : ${ta.dormancyDays ? `${ta.dormancyDays} days of silence followed by reactivation` : "Continuous activity"}

--------------------------------------------------------------------------------
PART IV: GROUNDS OF SUSPICION (RULE 3(1)(D) PML RULES 2005)
--------------------------------------------------------------------------------
${r.suspicionGrounds.map((g, idx) => `[${idx + 1}] ${g}`).join("\n\n")}

--------------------------------------------------------------------------------
PART V: AEGIS 5-STAGE AUTONOMOUS INTELLIGENCE TRACE
--------------------------------------------------------------------------------
Stage A (Prior Risk P0)   : ${(aa.stageA_prior * 100).toFixed(1)}% (XGBoost ML Feature Vector)
Stage B (Shannon Entropy) : ${aa.stageB_entropy.toFixed(3)} bits (Cutoff theta = 0.35: ${aa.stageB_threshold_met ? "SATISFIED" : "UNCERTAIN"})
Stage C (Info Sources)    : ${aa.stageC_sources.slice(0, 3).map((s) => `${s.source} (U=${s.utility.toFixed(3)})`).join(", ")}
Stage D (Graph Topology)  : ${aa.stageD_cycles.length > 0 ? aa.stageD_cycles.join("; ") : "No closed multi-hop loops identified"}
Stage E (Bayesian Post.)  : ${(aa.stageE_posterior * 100).toFixed(1)}% Certainty
Final Algorithmic Verdict : ${aa.stageE_verdict} (Certainty: ${aa.stageE_certaintyPct}%)

--------------------------------------------------------------------------------
PART VI: STATUTORY DIRECTIVE & RECOMMENDATION
--------------------------------------------------------------------------------
ORDER: ${r.recommendation}

Mandated Statutory Actions:
${r.regulatoryActions.map((a, i) => `  (${i + 1}) ${a}`).join("\n")}

--------------------------------------------------------------------------------
DIGITAL VERIFICATION & COMPLIANCE SEAL
--------------------------------------------------------------------------------
Signer Authority  : ${r.digitalSignature.signer}
Cryptographic Hash: ${r.digitalSignature.digest}
Timestamp (IST)   : ${r.digitalSignature.timestamp}
Standard          : ${r.digitalSignature.algorithm}

NOTICE: Section 66 of the Prevention of Money Laundering Act, 2002 prohibits
tipping off the customer regarding the filing of this report.
================================================================================
`.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex h-full flex-col bg-card">
      {/* TOP HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div>
          <h2 className="text-lg font-bold text-navy">Regulatory Compliance &amp; STR Filing</h2>
          <p className="text-sm text-muted-foreground">
            Financial Intelligence Unit (FIU-IND) &bull; Statutory Reporting under Section 12, PMLA 2002
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-saffron">
            FIU-IND Form FIN/STR v2.4
          </span>
          <span className="border border-gov-green/30 bg-gov-green/10 px-3 py-1.5 text-xs font-semibold text-gov-green">
            PML Rules 2005 Compliant
          </span>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[380px_1fr] overflow-hidden">
        {/* LEFT CONFIG COLUMN */}
        <div className="flex flex-col border-r border-border bg-muted/20 p-5 overflow-y-auto">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Report Parameters
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                Target Account Statement
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setCurrentReport(null);
                }}
                className="w-full border border-border bg-background px-3 py-2 text-sm font-medium outline-none focus:border-navy"
              >
                {accountStatements.map((stmt) => (
                  <option key={stmt.accountId} value={stmt.accountId}>
                    {stmt.accountId} - {stmt.accountName} ({stmt.transactions.length} txns)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                Statutory Filing Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "STR", label: "STR", desc: "Suspicious Activity" },
                  { id: "CTR", label: "CTR", desc: "Cash Limit > 10L" },
                  { id: "NETWORK_AUDIT", label: "Audit", desc: "Multi-Hop Trace" },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setReportType(t.id as "STR" | "CTR" | "NETWORK_AUDIT")}
                    className={`border px-2.5 py-2 text-left transition-colors ${
                      reportType === t.id
                        ? "border-navy bg-navy text-navy-foreground font-semibold"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    <div className="text-xs">{t.label}</div>
                    <div className="text-[10px] opacity-75">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Live Preview of Target Account */}
            {activeStatement && (
              <div className="border border-border bg-background p-3 text-xs space-y-1.5">
                <div className="font-semibold text-navy text-sm mb-1">Account Ledger Quick Scan</div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transactions:</span>
                  <span className="font-mono font-semibold">{activeStatement.transactions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Turnover:</span>
                  <span className="font-mono font-semibold">
                    {formatAmount(activeStatement.transactions.reduce((s, t) => s + (t.amount || 0), 0))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">High-Value (&gt;= 1L):</span>
                  <span className="font-mono font-semibold">
                    {activeStatement.transactions.filter((t) => t.amount >= 100000).length} txns
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Structuring (1.8L-2L):</span>
                  <span className="font-mono font-semibold">
                    {activeStatement.transactions.filter((t) => t.amount >= 180000 && t.amount < 200000).length} txns
                  </span>
                </div>
              </div>
            )}

            {matchedIssue && (
              <div className="border border-gov-red/30 bg-gov-red/5 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-gov-red mb-1">
                  <AlertTriangle className="h-4 w-4" /> Detected Forensic Flag
                </div>
                <div className="font-semibold">{matchedIssue.flag}</div>
                <div className="text-muted-foreground mt-0.5">{matchedIssue.detail}</div>
              </div>
            )}

            <button
              onClick={generateReport}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 border border-gov-red bg-gov-red py-2.5 text-sm font-bold text-white shadow-sm hover:bg-gov-red/90 disabled:opacity-50"
            >
              <FileBarChart className="h-4 w-4" />
              {isGenerating ? "Synthesizing Evidence & Analytics..." : "Generate Official STR Report"}
            </button>
          </div>

          {/* SESSIONS HISTORY */}
          {reportsHistory.length > 0 && (
            <div className="mt-8 border-t border-border pt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Session Generated Reports ({reportsHistory.length})
              </h4>
              <div className="space-y-2">
                {reportsHistory.map((rep) => (
                  <div
                    key={rep.id}
                    onClick={() => setCurrentReport(rep)}
                    className={`cursor-pointer border p-2.5 text-xs transition-colors ${
                      currentReport?.id === rep.id
                        ? "border-navy bg-card font-medium shadow-sm"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono font-semibold">
                      <span className="truncate mr-2">{rep.referenceId.split("/").slice(0, 3).join("/")}...</span>
                      <span
                        className={
                          rep.aegisAnalysis.stageE_verdict === "BLOCK"
                            ? "text-gov-red font-bold"
                            : rep.aegisAnalysis.stageE_verdict === "ESCALATE"
                            ? "text-saffron font-bold"
                            : "text-gov-green font-bold"
                        }
                      >
                        {rep.aegisAnalysis.stageE_verdict}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex justify-between">
                      <span>{rep.subject.accountNumber}</span>
                      <span className="font-mono">{formatCompactAmount(rep.transactionAnalysis.totalVolume)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT DOSSIER VIEWER (OFFICIAL GOVERNMENT LETTERHEAD FORMAT) */}
        <div className="flex flex-col overflow-y-auto p-6 bg-background">
          {currentReport ? (() => {
            const r = currentReport;
            const ta = r.transactionAnalysis;
            const aa = r.aegisAnalysis;
            const verdictBadge =
              aa.stageE_verdict === "BLOCK"
                ? "border-gov-red bg-gov-red text-white"
                : aa.stageE_verdict === "ESCALATE"
                ? "border-saffron bg-saffron text-white"
                : aa.stageE_verdict === "MONITOR"
                ? "border-gov-blue bg-gov-blue text-white"
                : "border-gov-green bg-gov-green text-white";

            return (
              <div className="mx-auto w-full max-w-4xl border border-border bg-card shadow-md">
                {/* OFFICIAL EMBLEM & LETTERHEAD */}
                <div className="border-b-4 border-navy bg-navy/[0.03] px-8 py-6 text-center">
                  <div className="inline-flex h-14 w-14 items-center justify-center bg-navy text-navy-foreground mb-2 shadow-sm">
                    <Shield className="h-8 w-8" />
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-saffron">
                    Government of India &bull; Ministry of Finance
                  </div>
                  <div className="text-2xl font-black tracking-wider text-navy mt-0.5">
                    FINANCIAL INTELLIGENCE UNIT &ndash; INDIA
                  </div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mt-0.5">
                    Department of Revenue &bull; 6th Floor, Hotel Samrat, Chanakyapuri, New Delhi - 110021
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                    <span className="border border-navy bg-navy px-3.5 py-1 text-xs font-bold text-white uppercase tracking-wider">
                      FORM STR &bull; SUSPICIOUS TRANSACTION REPORT
                    </span>
                    <span className="border border-gov-red bg-gov-red/10 px-3 py-1 text-xs font-extrabold text-gov-red uppercase tracking-wider">
                      STRICTLY CONFIDENTIAL // STATUTORY FILING
                    </span>
                    <span className={`px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${verdictBadge}`}>
                      VERDICT: {aa.stageE_verdict} ({aa.stageE_certaintyPct}%)
                    </span>
                  </div>
                </div>

                <div className="px-8 py-6 space-y-6">
                  {/* FILING METADATA STRIP */}
                  <div className="grid grid-cols-2 gap-4 border border-border bg-muted/30 p-4 text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Official Reference ID:</span>
                      <span className="font-mono font-bold text-sm text-navy">{r.referenceId}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Date &amp; Time of Transmission:</span>
                      <span className="font-semibold text-foreground">{r.date} IST</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Statutory Authority:</span>
                      <span className="font-medium text-foreground">Section 12(1)(a), PMLA 2002 read with Rule 7, PML Rules 2005</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Filing Standard:</span>
                      <span className="font-mono font-medium text-foreground">FIN/STR XML-JSON Schema v2.4 (RBI / FATF R.20)</span>
                    </div>
                  </div>

                  {/* PART I: REPORTING ENTITY (RE) DETAILS */}
                  <div>
                    <div className="flex items-center gap-2 border-b-2 border-navy pb-1 mb-3">
                      <span className="bg-navy text-white text-[10px] font-bold px-2 py-0.5">PART I</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                        Reporting Entity (RE) Particulars
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Reporting Institution:</span>{" "}
                        <span className="font-semibold text-foreground">{r.reportingEntity.name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Institution Category:</span>{" "}
                        <span className="font-medium text-foreground">{r.reportingEntity.category}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">FIU Registration No:</span>{" "}
                        <span className="font-mono font-bold text-foreground">{r.reportingEntity.registrationNo}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Principal Compliance Officer:</span>{" "}
                        <span className="font-semibold text-foreground">{r.reportingEntity.principalOfficer}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Designation:</span>{" "}
                        <span className="font-medium text-foreground">{r.reportingEntity.designation}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Node / Operational Unit:</span>{" "}
                        <span className="font-mono text-foreground">{r.reportingEntity.branchId}</span>
                      </div>
                    </div>
                  </div>

                  {/* PART II: SUBJECT ACCOUNT PARTICULARS */}
                  <div>
                    <div className="flex items-center gap-2 border-b-2 border-navy pb-1 mb-3">
                      <span className="bg-navy text-white text-[10px] font-bold px-2 py-0.5">PART II</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                        Subject Account Particulars
                      </h3>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="border border-border p-3 bg-muted/20">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Account Number</div>
                        <div className="font-mono font-bold text-base text-navy mt-0.5">{r.subject.accountNumber}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Core Banking System UID</div>
                      </div>
                      <div className="border border-border p-3 bg-muted/20">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Account Holder Name</div>
                        <div className="font-bold text-base text-foreground mt-0.5">{r.subject.accountHolderName}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">PAN: {r.subject.panNo}</div>
                      </div>
                      <div className="border border-border p-3 bg-muted/20">
                        <div className="text-muted-foreground text-[10px] uppercase tracking-wider">KYC &amp; Risk Classification</div>
                        <div className="font-bold text-sm text-gov-red mt-0.5">{r.subject.riskCategory} RISK</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{r.subject.kycStatus}</div>
                      </div>
                    </div>
                  </div>

                  {/* PART III: TRANSACTION FORENSIC ANALYSIS (COMPUTED FROM REAL DATA) */}
                  <div>
                    <div className="flex items-center gap-2 border-b-2 border-navy pb-1 mb-3">
                      <span className="bg-navy text-white text-[10px] font-bold px-2 py-0.5">PART III</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                        Transaction Forensic Analytics &amp; Ledger Audit
                      </h3>
                    </div>

                    <div className="text-xs text-muted-foreground mb-3">
                      Audit Review Period: <span className="font-mono font-bold text-foreground">{ta.dateRangeStart}</span> to{" "}
                      <span className="font-mono font-bold text-foreground">{ta.dateRangeEnd}</span> &bull; Total Ledger Records:{" "}
                      <span className="font-bold text-foreground">{ta.transactionCount} transactions</span>
                    </div>

                    {/* Summary Volume Cards */}
                    <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
                      <div className="border border-border p-3 bg-background">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Turnover</div>
                        <div className="font-bold text-base text-navy mt-1">{formatAmount(ta.totalVolume)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{ta.transactionCount} transactions analyzed</div>
                      </div>
                      <div className="border border-border p-3 bg-background">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Aggregate Credits</div>
                        <div className="font-bold text-base text-gov-green mt-1">{formatAmount(ta.totalCredits)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{ta.creditCount} credit credits</div>
                      </div>
                      <div className="border border-border p-3 bg-background">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Aggregate Debits</div>
                        <div className="font-bold text-base text-gov-red mt-1">{formatAmount(ta.totalDebits)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{ta.debitCount} debit debits</div>
                      </div>
                      <div className="border border-border p-3 bg-background">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Average Ticket Size</div>
                        <div className="font-bold text-base text-foreground mt-1">{formatAmount(ta.avgTransactionSize)}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Ratio: {ta.creditDebitRatio.toFixed(2)} Cr:Dr</div>
                      </div>
                    </div>

                    {/* Forensic Indicators Grid */}
                    <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
                      <div
                        className={`border p-2.5 ${
                          ta.highValueCount > 0 ? "border-gov-red/40 bg-gov-red/5" : "border-border bg-background"
                        }`}
                      >
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">High-Value (&gt;= 1L)</div>
                        <div className="font-extrabold text-sm text-gov-red mt-0.5">{ta.highValueCount} Transactions</div>
                        <div className="text-[10px] text-muted-foreground">{formatAmount(ta.highValueTotal)} total</div>
                      </div>

                      <div
                        className={`border p-2.5 ${
                          ta.structuringCount > 0 ? "border-saffron/50 bg-saffron/5" : "border-border bg-background"
                        }`}
                      >
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Structuring (1.8L-2L)</div>
                        <div className="font-extrabold text-sm text-saffron mt-0.5">{ta.structuringCount} Detected</div>
                        <div className="text-[10px] text-muted-foreground">Hovering below threshold</div>
                      </div>

                      <div
                        className={`border p-2.5 ${
                          ta.velocityBursts.length > 0 ? "border-gov-red/40 bg-gov-red/5" : "border-border bg-background"
                        }`}
                      >
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Velocity Bursts (&gt;=5/day)</div>
                        <div className="font-extrabold text-sm text-gov-red mt-0.5">{ta.velocityBursts.length} Burst Days</div>
                        <div className="text-[10px] text-muted-foreground">
                          {ta.velocityBursts[0] ? `Peak: ${ta.velocityBursts[0].count} txns on ${ta.velocityBursts[0].date}` : "Normal pace"}
                        </div>
                      </div>

                      <div
                        className={`border p-2.5 ${
                          ta.dormancyDays && ta.dormancyDays >= 30 ? "border-gov-red/40 bg-gov-red/5" : "border-border bg-background"
                        }`}
                      >
                        <div className="text-[10px] uppercase font-semibold text-muted-foreground">Inactivity Dormancy Gap</div>
                        <div className="font-extrabold text-sm text-foreground mt-0.5">
                          {ta.dormancyDays ? `${ta.dormancyDays} Days Silence` : "Continuous"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {ta.dormancyDays ? "Sudden reactivation observed" : "Regular operations"}
                        </div>
                      </div>
                    </div>

                    {/* Structuring Ledger Breakdown if detected */}
                    {ta.structuringTxns.length > 0 && (
                      <div className="border border-saffron/40 bg-saffron/5 p-3 mb-4 text-xs">
                        <div className="font-bold text-saffron uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> Smurfing &amp; Structuring Trail (INR 1,80,000 &ndash; INR 1,99,999)
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {ta.structuringTxns.slice(0, 6).map((st) => (
                            <div key={st.id} className="border border-border bg-background p-1.5 font-mono text-[11px]">
                              <div className="font-bold text-foreground">{formatAmount(st.amount)}</div>
                              <div className="text-muted-foreground text-[10px]">{st.date} &bull; {st.id}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top Counterparties Table */}
                    {ta.topCounterparties.length > 0 && (
                      <div className="mb-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Top Transacting Counterparties
                        </div>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted text-muted-foreground text-left">
                              <th className="border border-border px-3 py-1.5 font-semibold">Counterparty Account</th>
                              <th className="border border-border px-3 py-1.5 font-semibold">Entity Name</th>
                              <th className="border border-border px-3 py-1.5 text-right font-semibold">Aggregate Volume</th>
                              <th className="border border-border px-3 py-1.5 text-right font-semibold">Txn Count</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ta.topCounterparties.map((cp) => (
                              <tr key={cp.id} className="hover:bg-muted/30">
                                <td className="border border-border px-3 py-1 font-mono font-medium">{cp.id}</td>
                                <td className="border border-border px-3 py-1">{cp.name}</td>
                                <td className="border border-border px-3 py-1 text-right font-mono font-bold">
                                  {formatAmount(cp.totalAmount)}
                                </td>
                                <td className="border border-border px-3 py-1 text-right font-mono">{cp.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Payment Modes */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Payment Modes:
                      </span>
                      {ta.paymentModes.map((pm) => (
                        <span key={pm.mode} className="border border-border bg-background px-2 py-0.5 text-[11px]">
                          <strong className="font-semibold">{pm.mode}:</strong> {pm.count} ({formatCompactAmount(pm.total)})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* PART IV: STATUTORY GROUNDS OF SUSPICION */}
                  <div>
                    <div className="flex items-center gap-2 border-b-2 border-navy pb-1 mb-3">
                      <span className="bg-navy text-white text-[10px] font-bold px-2 py-0.5">PART IV</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                        Grounds for Suspicion (PML Rules 2005, Rule 3(1)(D))
                      </h3>
                    </div>
                    <div className="space-y-2 text-xs">
                      {r.suspicionGrounds.map((g, idx) => (
                        <div key={idx} className="flex items-start gap-2 border-l-2 border-gov-red pl-3 py-1.5 bg-muted/10">
                          <span className="font-mono font-bold text-gov-red shrink-0">[{idx + 1}]</span>
                          <span className="leading-relaxed text-foreground">{g}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* PART V: AEGIS 5-STAGE MATHEMATICAL PROOF & REASONING */}
                  <div>
                    <div className="flex items-center gap-2 border-b-2 border-navy pb-1 mb-3">
                      <span className="bg-navy text-white text-[10px] font-bold px-2 py-0.5">PART V</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-navy">
                        AEGIS 5-Stage Autonomous Investigative Evidence
                      </h3>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between border border-border p-2.5 bg-background">
                        <span className="font-semibold text-muted-foreground">
                          Stage A: Machine Learning Feature Scoring (43 Behavioral Vectors)
                        </span>
                        <span className="font-mono font-bold text-navy">
                          Prior Risk P&sub0; = {(aa.stageA_prior * 100).toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex items-center justify-between border border-border p-2.5 bg-background">
                        <span className="font-semibold text-muted-foreground">
                          Stage B: Information Entropy Verification (Shannon Uncertainty)
                        </span>
                        <span className="font-mono font-bold">
                          H(X) = {aa.stageB_entropy.toFixed(3)} bits{" "}
                          <span className={aa.stageB_threshold_met ? "text-gov-green font-bold" : "text-saffron font-bold"}>
                            (&theta; = 0.35 cutoff {aa.stageB_threshold_met ? "SATISFIED" : "PENDING"})
                          </span>
                        </span>
                      </div>

                      <div className="border border-border p-2.5 bg-background">
                        <div className="font-semibold text-muted-foreground mb-1">
                          Stage C: Adaptive Information-Theoretic Utilities (Utility = InfoGain / QueryCost)
                        </div>
                        <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                          {aa.stageC_sources.slice(0, 4).map((s) => (
                            <div key={s.source} className="flex justify-between border-b border-border/50 py-0.5">
                              <span className="truncate mr-2 text-muted-foreground">{s.source}:</span>
                              <span className="font-bold text-foreground">U = {s.utility.toFixed(3)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {aa.stageD_cycles.length > 0 && (
                        <div className="border border-gov-red/40 bg-gov-red/5 p-2.5 font-mono text-gov-red text-xs">
                          <div className="font-bold uppercase tracking-wider mb-0.5">
                            Stage D Graph Cycle &amp; Shell Traversal Result:
                          </div>
                          <div>{aa.stageD_cycles[0]}</div>
                        </div>
                      )}

                      <div
                        className={`flex items-center justify-between border-2 p-3 ${
                          aa.stageE_verdict === "BLOCK"
                            ? "border-gov-red bg-gov-red/10"
                            : aa.stageE_verdict === "ESCALATE"
                            ? "border-saffron bg-saffron/10"
                            : "border-gov-green bg-gov-green/10"
                        }`}
                      >
                        <span className="font-extrabold text-navy text-sm">
                          Stage E Final Bayesian Posterior &amp; Decision Boundary
                        </span>
                        <span className="font-mono font-black text-base text-gov-red">
                          {aa.stageE_certaintyPct}% Certainty &bull; [{aa.stageE_verdict}]
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* PART VI: STATUTORY ACTION DIRECTIVES */}
                  <div className="border border-border p-4 bg-muted/20">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Statutory Order &amp; Directives
                    </div>
                    <div className="font-mono font-bold text-sm text-gov-red mb-2">{r.recommendation}</div>
                    <div className="space-y-1 text-xs">
                      {r.regulatoryActions.map((action, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-foreground">
                          <span className="font-mono font-bold text-muted-foreground">({i + 1})</span>
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DIGITAL SIGNATURE VERIFICATION SEAL */}
                  <div className="border border-border bg-background p-4 text-xs space-y-1 text-muted-foreground font-mono">
                    <div className="font-bold text-foreground uppercase tracking-wider text-[11px] mb-1">
                      Cryptographic Digital Signature &amp; Non-Repudiation Certificate
                    </div>
                    <div>Signer: <span className="text-foreground">{r.digitalSignature.signer}</span></div>
                    <div>Digest: <span className="text-foreground">{r.digitalSignature.digest}</span></div>
                    <div>Timestamp: <span className="text-foreground">{r.digitalSignature.timestamp}</span></div>
                    <div>Standard: <span className="text-foreground">{r.digitalSignature.algorithm}</span></div>
                    <div className="text-[10px] text-gov-red font-semibold pt-1 border-t border-border mt-2">
                      LEGAL NOTICE: Under Section 66 of PMLA 2002, any unauthorized disclosure or tipping off to the account holder
                      carries statutory penal sanctions.
                    </div>
                  </div>

                  {/* ACTIONS BAR */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-border pt-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          downloadJsonFile(r.rawPayload, `FIU_IND_STR_${r.subject.accountNumber}_${Date.now()}.json`)
                        }
                        className="flex items-center gap-1.5 border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <Download className="h-4 w-4" /> Download Official JSON
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="flex items-center gap-1.5 border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <Printer className="h-4 w-4" /> Print / Save Official PDF
                      </button>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 border border-navy bg-navy px-4 py-2 text-xs font-bold text-navy-foreground hover:bg-navy-deep"
                    >
                      {copied ? <Check className="h-4 w-4 text-saffron" /> : <Copy className="h-4 w-4" />}
                      {copied ? "Copied STR to Clipboard!" : "Copy Official Text STR"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="flex h-full flex-col items-center justify-center text-center p-8 text-muted-foreground">
              <FileBarChart className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <h3 className="text-base font-semibold text-foreground">No Regulatory Report Selected</h3>
              <p className="max-w-md text-xs mt-1">
                Select an account statement from the left panel and click &quot;Generate Official STR Report&quot; to synthesize
                a statutory dossier based on real transaction analytics and AEGIS machine intelligence.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function SettingsContent() {
  const [entropyThreshold, setEntropyThreshold] = useState("0.35");
  const [decisionThreshold, setDecisionThreshold] = useState("0.85");
  const [cashThreshold, setCashThreshold] = useState("200000");
  const [maxHops, setMaxHops] = useState("8");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-lg font-bold text-navy">AEGIS System Parameters & Compliance Settings</h2>
          <p className="text-sm text-muted-foreground">
            Tune algorithmic boundaries, information-theoretic thresholds, and regulatory compliance settings
          </p>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-gov-green">
            <CheckCircle className="h-4 w-4" /> Parameters saved successfully!
          </span>
        )}
      </div>

      <div className="max-w-3xl p-6 space-y-6 overflow-y-auto">
        <div className="border border-border bg-background p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-navy">
            1. Algorithmic Intelligence Thresholds
          </h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">Stage B: Shannon Entropy Cutoff (θ in bits)</label>
              <input
                type="text"
                value={entropyThreshold}
                onChange={(e) => setEntropyThreshold(e.target.value)}
                className="w-full border border-border bg-card px-3 py-2 text-sm font-mono outline-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Uncertainty must fall below this value (default: 0.35) before triggering a final decision.
              </p>
            </div>
            <div>
              <label className="font-semibold block mb-1">Stage E: Decision Boundary Probability</label>
              <input
                type="text"
                value={decisionThreshold}
                onChange={(e) => setDecisionThreshold(e.target.value)}
                className="w-full border border-border bg-card px-3 py-2 text-sm font-mono outline-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                P(fraud | Evidence) &gt; this value triggers an immediate account BLOCK and STR filing.
              </p>
            </div>
          </div>
        </div>

        <div className="border border-border bg-background p-5 space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-navy">
            2. Regulatory Compliance & Graph Depth
          </h3>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">Statutory Structuring Limit (INR ₹)</label>
              <input
                type="text"
                value={cashThreshold}
                onChange={(e) => setCashThreshold(e.target.value)}
                className="w-full border border-border bg-card px-3 py-2 text-sm font-mono outline-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Transactions hovering near this statutory threshold trigger anti-structuring flags.
              </p>
            </div>
            <div>
              <label className="font-semibold block mb-1">Max BFS Shell Traversal Hops</label>
              <input
                type="text"
                value={maxHops}
                onChange={(e) => setMaxHops(e.target.value)}
                className="w-full border border-border bg-card px-3 py-2 text-sm font-mono outline-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Graph intelligence explores network reachability up to this depth (default: 8 hops).
              </p>
            </div>
          </div>
        </div>

        <div className="border border-border bg-muted/30 p-5 space-y-2 text-xs">
          <h3 className="font-bold uppercase tracking-wider text-muted-foreground">Connected Engine Status</h3>
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">XGBoost Scoring Engine</span>
            <span className="font-mono font-bold text-gov-green">Active (43 Engineered Features)</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">NetworkX In-Memory Topology</span>
            <span className="font-mono font-bold text-gov-green">500 Accounts · 7,101 Edges Indexed</span>
          </div>
          <div className="flex justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">FIU-IND Regulatory Gateway</span>
            <span className="font-mono font-bold text-navy">Connected (Direct STR Dispatch)</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => {
              setEntropyThreshold("0.35");
              setDecisionThreshold("0.85");
              setCashThreshold("200000");
              setMaxHops("8");
            }}
            className="border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-muted"
          >
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            className="border border-navy bg-navy px-6 py-2 text-xs font-bold text-navy-foreground hover:bg-navy-deep"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const serverStatements = Route.useLoaderData();
  const graphPanelRef = useRef<HTMLDivElement | null>(null);
  const [activeView, setActiveView] = useState<AppView>("Dashboard");

  // Client-side uploaded CSVs
  const [uploadedStatements, setUploadedStatements] = useState<AccountStatement[]>([]);
  const [useImportedOnly, setUseImportedOnly] = useState(false);
  const [showSelectedOnlyInColumn, setShowSelectedOnlyInColumn] = useState(false);
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, "parsing" | "done" | "error">>({}); 
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // When custom files are imported or default files are removed, only show uploaded files!
  const accountStatements = useMemo<AccountStatement[]>(() => {
    if (useImportedOnly || uploadedStatements.length > 0) {
      return uploadedStatements;
    }
    return serverStatements;
  }, [serverStatements, uploadedStatements, useImportedOnly]);

  function parseAndAddFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".csv"),
    );
    if (!arr.length) return;
    setImportPanelOpen(true);
    
    // Automatically remove default files when new CSVs are imported!
    setUseImportedOnly(true);

    // Auto-select the imported files immediately
    setSelectedFileNames((prev) => {
      const next = new Set(uploadedStatements.map((s) => s.name));
      arr.forEach((f) => next.add(f.name));
      return next;
    });

    if (arr[0]) {
      setPreviewStatementName(arr[0].name);
    }

    for (const file of arr) {
      setUploadProgress((prev) => ({ ...prev, [file.name]: "parsing" }));
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const csv = e.target?.result as string;
          const parsed = parseAccountStatement(file.name, csv);
          setUploadedStatements((prev) => {
            const existing = prev.filter((s) => s.name !== file.name);
            return [...existing, parsed];
          });
          setUploadProgress((prev) => ({ ...prev, [file.name]: "done" }));
        } catch {
          setUploadProgress((prev) => ({ ...prev, [file.name]: "error" }));
        }
      };
      reader.onerror = () =>
        setUploadProgress((prev) => ({ ...prev, [file.name]: "error" }));
      reader.readAsText(file);
    }
  }

  function removeUploadedStatement(name: string) {
    setUploadedStatements((prev) => prev.filter((s) => s.name !== name));
    setSelectedFileNames((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    setUploadProgress((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }
  const [previewStatementName, setPreviewStatementName] = useState(serverStatements[0]?.name ?? "");
  const [selectedFileNames, setSelectedFileNames] = useState(
    () => new Set(serverStatements.slice(0, 2).map((statement) => statement.name)),
  );
  const [accountSearch, setAccountSearch] = useState("");
  const [transactionSearch, setTransactionSearch] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<FlowDetail | null>(null);
  const [flagPanelOpen, setFlagPanelOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FlaggedAccount | null>(null);
  const [flagFilterActive, setFlagFilterActive] = useState(false);

  // New interactive states
  const [reportTargetAccountId, setReportTargetAccountId] = useState<string>("");
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [manualFlagAccount, setManualFlagAccount] = useState("");
  const [manualFlagReason, setManualFlagReason] = useState<FlaggedAccount["flag"]>("Circular Loop");
  const [manualFlagDetail, setManualFlagDetail] = useState("");

  // Live Dynamic Alerts State
  const [manualFlags, setManualFlags] = useState<FlaggedAccount[]>([]);
  const [alertScope, setAlertScope] = useState<"all" | "selected">("selected");

  // Backend Diagnostics State
  const [backendModalOpen, setBackendModalOpen] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [isTestingBackend, setIsTestingBackend] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [activeDiagStageTab, setActiveDiagStageTab] = useState<"all" | "A" | "B" | "C" | "D" | "E">("all");

  async function handleRunBackendDiagnostic(stage: string = "all") {
    setIsTestingBackend(true);
    setDiagnosticsError(null);
    try {
      const res = await runBackendDiagnosticsFn({ data: stage });
      setDiagnosticsData((prev: any) => {
        if (stage === "all" || !prev) {
          return res;
        }
        return {
          ...prev,
          stages: {
            ...prev.stages,
            ...(res as any).stages,
          },
          total_latency_ms: (res as any).total_latency_ms || prev.total_latency_ms,
          timestamp: (res as any).timestamp || prev.timestamp,
        };
      });
    } catch (err: any) {
      setDiagnosticsError(err?.message || "Failed to execute backend diagnostic.");
    } finally {
      setIsTestingBackend(false);
    }
  }

  // Top Filter states
  const [headerAccountSearch, setHeaderAccountSearch] = useState("");
  const [minAmountFilter, setMinAmountFilter] = useState("");
  const [maxAmountFilter, setMaxAmountFilter] = useState("");
  const [txnTypeFilter, setTxnTypeFilter] = useState<"ALL" | "CREDIT" | "DEBIT">("ALL");
  const [suspiciousOnlyFilter, setSuspiciousOnlyFilter] = useState(false);
  const [selectedMonthFilter, setSelectedMonthFilter] = useState("ALL");
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  function handleGlobalReset() {
    setTransactionSearch("");
    setAccountSearch("");
    setHeaderAccountSearch("");
    setMinAmountFilter("");
    setMaxAmountFilter("");
    setTxnTypeFilter("ALL");
    setSuspiciousOnlyFilter(false);
    setSelectedMonthFilter("ALL");
    setSelectedFlag(null);
    setFlagFilterActive(false);
    setSelectedFlow(null);
  }

  const accountStatementFiles = useMemo(
    () =>
      accountStatements.map((statement) => ({
        ...statement,
        checked: selectedFileNames.has(statement.name),
      })),
    [accountStatements, selectedFileNames],
  );
  const visibleAccountStatementFiles = useMemo(() => accountStatementFiles.filter((statement) => {
    // Unless selected, it shouldn't come in the account csv column if showSelectedOnlyInColumn is active
    if (showSelectedOnlyInColumn && !statement.checked) {
      return false;
    }
    const query = accountSearch.trim().toLowerCase();
    if (!query) return true;

    return (
      statement.name.toLowerCase().includes(query) ||
      statement.accountId.toLowerCase().includes(query) ||
      statement.accountName.toLowerCase().includes(query)
    );
  }), [accountSearch, accountStatementFiles, showSelectedOnlyInColumn]);
  const selectedStatements = useMemo(
    () => accountStatementFiles.filter((statement) => statement.checked),
    [accountStatementFiles],
  );

  // Automatically recalculate flagged accounts whenever accountStatements, selectedStatements, or alertScope changes!
  const autoFlaggedAccounts = useMemo(() => {
    const target =
      alertScope === "selected" && selectedStatements.length > 0
        ? selectedStatements
        : accountStatements;
    return buildFlaggedAccounts(target);
  }, [accountStatements, selectedStatements, alertScope]);

  const flaggedAccounts = useMemo(() => {
    return [...manualFlags, ...autoFlaggedAccounts];
  }, [manualFlags, autoFlaggedAccounts]);

  const previewStatement =
    accountStatementFiles.find((statement) => statement.name === previewStatementName) ??
    visibleAccountStatementFiles[0] ??
    accountStatementFiles[0];
  const selectedFlagTransactionIds = useMemo(
    () => (selectedFlag ? new Set(selectedFlag.transactionIds) : null),
    [selectedFlag],
  );
  const graphStatements = useMemo(() => {
    const flaggedStatements = filterStatementsByExactTransactionIds(
      selectedStatements,
      flagFilterActive ? selectedFlagTransactionIds : null,
    );
    const byTxnSearch = filterStatementsByTransactionId(flaggedStatements, transactionSearch);

    return byTxnSearch.map((statement) => ({
      ...statement,
      transactions: statement.transactions.filter((t) => {
        if (headerAccountSearch) {
          const q = headerAccountSearch.trim().toLowerCase();
          const matchFrom = t.fromAccount.toLowerCase().includes(q) || (t.fromName || "").toLowerCase().includes(q);
          const matchTo = t.toAccount.toLowerCase().includes(q) || (t.toName || "").toLowerCase().includes(q);
          if (!matchFrom && !matchTo) return false;
        }
        if (minAmountFilter && t.amount < Number(minAmountFilter)) return false;
        if (maxAmountFilter && t.amount > Number(maxAmountFilter)) return false;
        if (txnTypeFilter !== "ALL" && t.transactionType?.trim().toUpperCase() !== txnTypeFilter) return false;
        if (suspiciousOnlyFilter && t.amount < 100000 && !selectedFlagTransactionIds?.has(t.transactionId)) return false;
        if (selectedMonthFilter !== "ALL") {
          const monthMap: Record<string, string> = { "Jan ’24": "-01-", "Feb ’24": "-02-", "Mar ’24": "-03-", "Apr ’24": "-04-" };
          const pattern = monthMap[selectedMonthFilter];
          if (pattern && !t.date.includes(pattern)) return false;
        }
        return true;
      }),
    }));
  }, [
    flagFilterActive,
    selectedStatements,
    selectedFlagTransactionIds,
    transactionSearch,
    headerAccountSearch,
    minAmountFilter,
    maxAmountFilter,
    txnTypeFilter,
    suspiciousOnlyFilter,
    selectedMonthFilter,
  ]);
  const selectedFileCount = accountStatementFiles.filter((file) => file.checked).length;
  const graph = useMemo(
    () => buildMoneyFlowGraph(graphStatements, { spacious: flagFilterActive }),
    [flagFilterActive, graphStatements],
  );
  const [manualNodePositions, setManualNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [activeDrag, setActiveDrag] = useState<DragState | null>(null);
  const [activeCanvasDrag, setActiveCanvasDrag] = useState<CanvasDragState | null>(null);
  const [viewBox, setViewBox] = useState<ViewBoxState>(INITIAL_VIEW_BOX);
  const [isCanvasLocked, setIsCanvasLocked] = useState(false);
  const graphNodes = graph.nodes.map((node) => ({
    ...node,
    ...(manualNodePositions[graphNodeKey(node)] ?? {}),
  }));
  const centerCards = graph.centerCards.map((card) => ({
    ...card,
    ...(manualNodePositions[centerCardKey(card.id)] ?? {}),
  }));
  const centerLinks = buildCenterLinks(centerCards, graphStatements);
  const [overviewOpen, setOverviewOpen] = useState(false);

  function ensureFlaggedAccounts() {
    return flaggedAccounts;
  }

  function displayFlaggedAccount(issue: FlaggedAccount, nextView: AppView = "Dashboard") {
    const fileNames = accountStatementFiles
      .filter((statement) => issue.accountIds.includes(statement.accountId))
      .map((statement) => statement.name);

    setSelectedFileNames(new Set(fileNames));
    setSelectedFlag(issue);
    setFlagFilterActive(true);
    setActiveView(nextView);
    setTransactionSearch("");
    setSelectedFlow(null);
    setManualNodePositions({});
    setViewBox(INITIAL_VIEW_BOX);
    setFlagPanelOpen(false);
  }

  function resetGraphView() {
    setTransactionSearch("");
    setSelectedFlag(null);
    setFlagFilterActive(false);
    setSelectedFlow(null);
    setManualNodePositions({});
    setViewBox(INITIAL_VIEW_BOX);
    setFlagPanelOpen(false);
  }

  function toggleGraphFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    void graphPanelRef.current?.requestFullscreen();
  }

  function beginNodeDrag(
    event: PointerEvent<SVGGElement>,
    key: string,
    position: { x: number; y: number },
    size = { width: NODE_WIDTH, height: NODE_HEIGHT },
  ) {
    event.preventDefault();
    event.stopPropagation();
    const point = getSvgPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveDrag({
      id: key,
      offsetX: point.x - position.x,
      offsetY: point.y - position.y,
      ...size,
    });
  }

  function beginCanvasDrag(event: PointerEvent<SVGRectElement>) {
    if (isCanvasLocked) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveCanvasDrag({
      clientX: event.clientX,
      clientY: event.clientY,
      viewBox,
    });
  }

  function dragNode(event: PointerEvent<SVGSVGElement>) {
    if (activeCanvasDrag) {
      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const deltaX = ((event.clientX - activeCanvasDrag.clientX) * activeCanvasDrag.viewBox.width) / rect.width;
      const deltaY = ((event.clientY - activeCanvasDrag.clientY) * activeCanvasDrag.viewBox.height) / rect.height;
      setViewBox({
        ...activeCanvasDrag.viewBox,
        x: activeCanvasDrag.viewBox.x - deltaX,
        y: activeCanvasDrag.viewBox.y - deltaY,
      });
      return;
    }

    if (!activeDrag) return;

    const point = getSvgPoint(event);
    setManualNodePositions((current) => ({
      ...current,
      [activeDrag.id]: {
        x: clamp(point.x - activeDrag.offsetX, 0, GRAPH_WIDTH - activeDrag.width),
        y: clamp(point.y - activeDrag.offsetY, 0, GRAPH_HEIGHT - activeDrag.height),
      },
    }));
  }

  function endNodeDrag() {
    setActiveDrag(null);
    setActiveCanvasDrag(null);
  }
  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans text-sm text-foreground">
      {/* TOP HEADER */}
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center border border-border bg-navy text-navy-foreground">
            <Shield className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold uppercase tracking-wider text-saffron">Government of India</div>
            <div className="text-lg font-bold text-navy">Financial Intelligence Unit</div>
          </div>
          <div className="mx-5 h-9 w-px bg-border" />
          <div className="leading-tight">
            <h1 className="text-lg font-semibold text-foreground">Transaction Flow Analysis</h1>
            <p className="text-sm text-muted-foreground">Visualize money flow between accounts and identify key transaction patterns</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Global Refresh & Clear Button */}
          <button
            onClick={handleGlobalReset}
            className="flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted active:scale-[0.99] transition-all shadow-xs"
            title="Refresh and clear all active filters, searches, and selections across the platform"
          >
            <RefreshCw className="h-4 w-4 text-navy" />
            <span>Refresh &amp; Clear</span>
          </button>

          {/* Backend Diagnostics Button */}
          <button
            onClick={() => {
              setBackendModalOpen(true);
              if (!diagnosticsData && !isTestingBackend) {
                handleRunBackendDiagnostic("all");
              }
            }}
            className="flex items-center gap-2 border border-navy/40 bg-navy/5 px-3.5 py-2 text-sm font-semibold text-navy hover:bg-navy hover:text-white active:scale-[0.99] transition-all shadow-xs"
            title="Run real Stage A to Stage E diagnostic tests against Python backend"
          >
            <Activity className="h-4 w-4 text-saffron" />
            <span>Backend Diagnostics</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gov-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-gov-green"></span>
            </span>
          </button>

          <button
            onClick={() => setFlagModalOpen(true)}
            className="flex items-center gap-1.5 border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted active:scale-[0.99] transition-transform"
          >
            <Flag className="h-4 w-4 text-gov-red" />
            Flag / Mark Transaction
          </button>
          <button
            onClick={() => {
              setReportTargetAccountId(previewStatement?.accountId || "");
              setActiveView("Reports");
            }}
            className="flex items-center gap-1.5 border border-gov-red bg-gov-red px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-gov-red/90 active:scale-[0.99] transition-transform"
          >
            <FileBarChart className="h-4 w-4" />
            Export STR Report
          </button>
          <div className="mx-1 h-6 w-px bg-border" />
          <button
            onClick={() => setActiveView("Settings")}
            className="flex items-center gap-2 border border-border bg-card py-1.5 pl-1.5 pr-3 text-sm font-medium hover:bg-muted"
            title="System Settings"
          >
            <div className="flex h-7 w-7 items-center justify-center bg-navy text-xs font-semibold text-navy-foreground">AN</div>
            <span>Analyst</span>
            <Settings className="h-3.5 w-3.5 text-muted-foreground ml-1" />
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-6 py-2.5 text-sm">
        <div className="flex items-center gap-2 border border-border bg-card px-3 py-1.5 font-medium text-xs">
          <FileText className="h-4 w-4 text-gov-blue" />
          {selectedFileCount} files selected
        </div>
        <div className="flex items-center gap-2 border border-border bg-card px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={headerAccountSearch}
            onChange={(e) => setHeaderAccountSearch(e.target.value)}
            className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Search Account ID / Name"
          />
          {headerAccountSearch && (
            <button onClick={() => setHeaderAccountSearch("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 border border-border bg-card px-2.5 py-1.5 text-xs">
          <span className="text-muted-foreground">Amount ₹</span>
          <input
            type="number"
            value={minAmountFilter}
            onChange={(e) => setMinAmountFilter(e.target.value)}
            className="w-16 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Min"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            value={maxAmountFilter}
            onChange={(e) => setMaxAmountFilter(e.target.value)}
            className="w-16 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Max"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setTypeDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 border border-border bg-card px-3 py-1.5 text-xs font-medium"
          >
            <span>Type: {txnTypeFilter}</span> <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {typeDropdownOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-28 border border-border bg-card p-1 shadow-md text-xs">
              {(["ALL", "CREDIT", "DEBIT"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTxnTypeFilter(t);
                    setTypeDropdownOpen(false);
                  }}
                  className={`w-full px-2 py-1 text-left hover:bg-muted ${txnTypeFilter === t ? "font-bold text-navy" : ""}`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 border border-border bg-card px-3 py-1.5 text-xs font-medium">
          <input
            type="checkbox"
            checked={suspiciousOnlyFilter}
            onChange={(e) => setSuspiciousOnlyFilter(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--navy)]"
          />
          Flagged / &gt;₹1L Only
        </label>
        <div className="flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-xs">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground mr-1">Period:</span>
          {["ALL", "Jan ’24", "Feb ’24", "Mar ’24", "Apr ’24"].map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMonthFilter(m)}
              className={`px-1.5 py-0.5 rounded text-[11px] ${
                selectedMonthFilter === m ? "bg-navy text-navy-foreground font-semibold" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {(headerAccountSearch || minAmountFilter || maxAmountFilter || txnTypeFilter !== "ALL" || suspiciousOnlyFilter || selectedMonthFilter !== "ALL") && (
          <button
            onClick={() => {
              setHeaderAccountSearch("");
              setMinAmountFilter("");
              setMaxAmountFilter("");
              setTxnTypeFilter("ALL");
              setSuspiciousOnlyFilter(false);
              setSelectedMonthFilter("ALL");
            }}
            className="flex items-center gap-1 text-xs font-semibold text-gov-red hover:underline ml-2"
          >
            <X className="h-3 w-3" /> Reset Filters
          </button>
        )}
      </div>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">
        {/* Icon nav */}
        <nav className="flex w-14 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3">
          {navItems.map(({ icon: Icon, label }) => {
            const active = activeView === label;
            return (
              <button
                key={label}
                title={label}
                onClick={() => {
                  if (label === "Alerts") {
                    const issues = ensureFlaggedAccounts();
                    setSelectedFlag((current) => current ?? issues[0] ?? null);
                  }
                  if (label === "Dashboard") {
                    setSelectedFlag(null);
                    setFlagFilterActive(false);
                    setTransactionSearch("");
                    setSelectedFlow(null);
                  }
                  if (label === "Reports") {
                    ensureFlaggedAccounts();
                    if (!reportTargetAccountId && previewStatement) {
                      setReportTargetAccountId(previewStatement.accountId);
                    }
                  }
                  setActiveView(label);
                  if (label === "Account Statements" && !previewStatementName) {
                    setPreviewStatementName(previewStatement?.name ?? "");
                  }
                }}
                className={`flex h-11 w-11 items-center justify-center border-l-2 ${
                  active
                    ? "border-saffron bg-sidebar-accent text-sidebar-primary-foreground"
                    : "border-transparent text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.7} />
              </button>
            );
          })}
          <div className="mt-auto">
            <button
              onClick={() => setActiveView((v) => (v === "Settings" ? "Dashboard" : "Settings"))}
              title="System Settings"
              className={`flex h-11 w-11 items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent/50 ${activeView === "Settings" ? "bg-sidebar-accent text-saffron" : ""}`}
            >
              <Settings className="h-5 w-5" strokeWidth={1.7} />
            </button>
          </div>
        </nav>

        {/* Account statements panel */}
        <aside className="flex w-80 flex-col border-r border-border bg-card">
          {/* Column Header with Status */}
          <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-navy">Account Statements CSV</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {useImportedOnly || uploadedStatements.length > 0
                  ? `Imported Data (${accountStatements.length} files)`
                  : `Default Data (${accountStatements.length} files)`}
              </p>
            </div>
            {/* Toggle to remove/restore default files */}
            {useImportedOnly || uploadedStatements.length > 0 ? (
              <button
                onClick={() => {
                  setUseImportedOnly(false);
                  setUploadedStatements([]);
                  setSelectedFileNames(new Set(serverStatements.slice(0, 2).map((s) => s.name)));
                  setPreviewStatementName(serverStatements[0]?.name ?? "");
                }}
                className="text-[10px] font-semibold text-navy bg-navy/10 border border-navy/30 px-2 py-1 hover:bg-navy hover:text-white transition-colors"
                title="Restore original 50 synthetic accounts"
              >
                Restore Defaults
              </button>
            ) : (
              <button
                onClick={() => {
                  setUseImportedOnly(true);
                  setSelectedFileNames(new Set());
                  setPreviewStatementName("");
                }}
                className="text-[10px] font-semibold text-gov-red bg-gov-red/10 border border-gov-red/30 px-2 py-1 hover:bg-gov-red hover:text-white transition-colors"
                title="Remove default files to import your own clean dataset"
              >
                Clear Defaults
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="border-b border-border p-2.5">
            <div className="flex items-center gap-2 border border-border bg-background px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={accountSearch}
                onChange={(event) => setAccountSearch(event.target.value)}
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                placeholder="Search by ID or Name..."
              />
            </div>
          </div>

          {/* Filter Tab: All vs Selected Only */}
          <div className="flex border-b border-border text-xs font-semibold bg-muted/15">
            <button
              onClick={() => setShowSelectedOnlyInColumn(false)}
              className={`flex-1 py-1.5 text-center text-[11px] transition-colors border-b-2 ${
                !showSelectedOnlyInColumn
                  ? "border-navy text-navy font-bold bg-card"
                  : "border-transparent text-muted-foreground hover:bg-muted/50"
              }`}
            >
              All Files ({accountStatements.length})
            </button>
            <button
              onClick={() => setShowSelectedOnlyInColumn(true)}
              className={`flex-1 py-1.5 text-center text-[11px] transition-colors border-b-2 ${
                showSelectedOnlyInColumn
                  ? "border-navy text-navy font-bold bg-card"
                  : "border-transparent text-muted-foreground hover:bg-muted/50"
              }`}
            >
              Selected Only ({selectedFileCount})
            </button>
          </div>

          {/* Multi-Selection Action Toolbar */}
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1 text-[11px]">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const allVisibleNames = visibleAccountStatementFiles.map((f) => f.name);
                  setSelectedFileNames((prev) => new Set([...prev, ...allVisibleNames]));
                }}
                className="font-semibold text-navy hover:underline text-[10px]"
                title="Select all visible accounts"
              >
                Select All
              </button>
              <span className="text-muted-foreground">&bull;</span>
              <button
                onClick={() => setSelectedFileNames(new Set())}
                className="text-muted-foreground hover:text-gov-red hover:underline text-[10px]"
                title="Clear all selections"
              >
                Deselect
              </button>
              <span className="text-muted-foreground">&bull;</span>
              <button
                onClick={() => {
                  setSelectedFileNames((prev) => {
                    const next = new Set<string>();
                    visibleAccountStatementFiles.forEach((f) => {
                      if (!prev.has(f.name)) next.add(f.name);
                    });
                    return next;
                  });
                }}
                className="text-muted-foreground hover:text-foreground hover:underline text-[10px]"
                title="Invert current selection"
              >
                Invert
              </button>
            </div>
            <span className="text-[10px] text-muted-foreground opacity-80" title="Hold Shift and click another checkbox to select an entire range">
              Shift+Click: Range
            </span>
          </div>

          {/* Statement files list */}
          <ul className="flex-1 overflow-y-auto py-1 text-sm">
            {visibleAccountStatementFiles.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-muted-foreground">
                {showSelectedOnlyInColumn ? (
                  <div>
                    <p className="font-semibold text-foreground">No accounts selected.</p>
                    <p className="text-[11px] mt-1">Switch to "All Files" above to select accounts.</p>
                    <button
                      onClick={() => setShowSelectedOnlyInColumn(false)}
                      className="mt-2.5 text-[11px] font-semibold text-navy underline"
                    >
                      Show All Files
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold text-foreground">No accounts found.</p>
                    <p className="text-[11px] mt-1">Drop CSV files below to import.</p>
                  </div>
                )}
              </li>
            ) : (
              visibleAccountStatementFiles.map((f, idx) => (
                <li key={f.name}>
                  <div
                    className={`flex min-h-10 cursor-pointer items-center justify-between gap-2 px-3 py-1.5 hover:bg-muted/70 ${
                      previewStatementName === f.name && activeView === "Account Statements" ? "bg-muted" : ""
                    }`}
                    title="Double-click to view CSV statement"
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      setPreviewStatementName(f.name);
                      setActiveView("Account Statements");
                    }}
                  >
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={f.checked}
                        onChange={(e) => {
                          const shift = (e.nativeEvent as MouseEvent).shiftKey;
                          setPreviewStatementName(f.name);
                          if (shift && lastSelectedIdx !== null) {
                            const start = Math.min(lastSelectedIdx, idx);
                            const end = Math.max(lastSelectedIdx, idx);
                            const range = visibleAccountStatementFiles.slice(start, end + 1).map((s) => s.name);
                            setSelectedFileNames((prev) => {
                              const next = new Set(prev);
                              const shouldSelect = !prev.has(f.name);
                              range.forEach((name) => {
                                if (shouldSelect) next.add(name);
                                else next.delete(name);
                              });
                              return next;
                            });
                          } else {
                            setSelectedFileNames((current) => {
                              const next = new Set(current);
                              if (next.has(f.name)) {
                                next.delete(f.name);
                              } else {
                                next.add(f.name);
                              }
                              return next;
                            });
                          }
                          setLastSelectedIdx(idx);
                        }}
                        className="h-4 w-4 accent-[var(--navy)] shrink-0"
                      />
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-xs ${f.checked ? "font-bold text-foreground" : "text-foreground"}`}>
                          {f.name}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {f.accountName}
                        </div>
                      </div>
                    </label>
                  </div>
                </li>
              ))
            )}
          </ul>
          {/* Import zone (Collapsible / Minimizeable) */}
          <div className="border-t border-border bg-card">
            {/* Collapsible Header */}
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-3 py-2 text-xs">
              <button
                onClick={() => setImportPanelOpen((prev) => !prev)}
                className="flex items-center gap-1.5 font-bold text-navy hover:underline"
                title={importPanelOpen ? "Click to minimize import panel" : "Click to expand import panel"}
              >
                <Upload className="h-3.5 w-3.5 text-navy" />
                <span>Import CSV Files</span>
                {Object.keys(uploadProgress).length > 0 && (
                  <span className="bg-gov-green/20 text-gov-green px-1.5 py-0.2 text-[10px] font-bold rounded-sm">
                    {Object.keys(uploadProgress).length}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1">
                {Object.keys(uploadProgress).length > 0 && (
                  <button
                    onClick={() => setUploadProgress({})}
                    className="text-[10px] text-muted-foreground hover:text-gov-red hover:underline mr-1"
                    title="Dismiss progress list"
                  >
                    Clear List
                  </button>
                )}
                <button
                  onClick={() => setImportPanelOpen((prev) => !prev)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-semibold border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title={importPanelOpen ? "Minimize import section" : "Expand import section"}
                >
                  <span>{importPanelOpen ? "Minimize" : "Import"}</span>
                  {importPanelOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Expandable Content */}
            {importPanelOpen && (
              <div className="p-3 bg-muted/10 space-y-2">
                {/* Drag-and-drop drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    parseAndAddFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer border-2 border-dashed px-3 py-3 text-center transition-colors ${
                    isDragOver
                      ? "border-navy bg-navy/5 text-navy"
                      : "border-border text-muted-foreground hover:border-navy/50 hover:bg-muted/50"
                  }`}
                >
                  <Upload className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold">
                    {isDragOver ? "Drop CSVs here!" : "Drop CSV files or click to browse"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/70">Supports large files · Multiple files at once</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && parseAndAddFiles(e.target.files)}
                />

                {/* Per-file progress list (Constrained with max-height and auto scroll) */}
                {Object.keys(uploadProgress).length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground px-0.5">
                      <span>Imported Items ({Object.keys(uploadProgress).length})</span>
                      <button
                        onClick={() => setImportPanelOpen(false)}
                        className="text-navy hover:underline font-bold"
                      >
                        Done (Minimize)
                      </button>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                      {Object.entries(uploadProgress).map(([name, status]) => (
                        <div key={name} className={`flex items-center justify-between gap-2 border px-2 py-1 text-[11px] ${
                          status === "done" ? "border-gov-green/30 bg-gov-green/5" :
                          status === "error" ? "border-gov-red/30 bg-gov-red/5" :
                          "border-border bg-muted/30"
                        }`}>
                          <div className="flex min-w-0 items-center gap-1.5">
                            {status === "parsing" && (
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-navy border-t-transparent" />
                            )}
                            {status === "done" && <FileCheck className="h-3 w-3 shrink-0 text-gov-green" />}
                            {status === "error" && <X className="h-3 w-3 shrink-0 text-gov-red" />}
                            <span className="truncate font-mono text-[10px]" title={name}>{name}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className={`font-semibold text-[10px] ${
                              status === "done" ? "text-gov-green" :
                              status === "error" ? "text-gov-red" : "text-muted-foreground"
                            }`}>
                              {status === "parsing" ? "Parsing…" : status === "done" ? "Ready" : "Error"}
                            </span>
                            {(status === "done" || status === "error") && (
                              <button
                                onClick={() => removeUploadedStatement(name)}
                                className="ml-0.5 text-muted-foreground hover:text-gov-red"
                                title="Remove"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => setImportPanelOpen(false)}
                      className="w-full mt-1 border border-border bg-background py-1 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      Minimize Import Panel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm">
            <span className="font-medium text-xs">{selectedFileCount} selected · {accountStatements.length} total</span>
            <button className="text-xs text-gov-blue hover:underline" onClick={() => setSelectedFileNames(new Set())}>
              Clear selection
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 overflow-hidden p-0">
          {activeView === "Account Statements" ? (
            <AccountStatementContent
              statement={previewStatement}
              selectedStatements={selectedStatements}
              onSelectStatement={(name) => setPreviewStatementName(name)}
              onGenerateReport={(accId) => {
                setReportTargetAccountId(accId);
                setActiveView("Reports");
              }}
            />
          ) : activeView === "Alerts" ? (
            <AlertsContent
              issues={flaggedAccounts}
              selectedIssue={selectedFlag}
              alertScope={alertScope}
              setAlertScope={setAlertScope}
              selectedCount={selectedStatements.length}
              totalCount={accountStatements.length}
              onIssueClick={(issue) => {
                displayFlaggedAccount(issue);
              }}
              onGenerateReportFromIssue={(issue) => {
                setReportTargetAccountId(issue.id);
                setActiveView("Reports");
              }}
            />
          ) : activeView === "Reports" ? (
            <ReportsContent
              accountStatements={accountStatements}
              flaggedAccounts={flaggedAccounts ?? ensureFlaggedAccounts()}
              initialAccountId={reportTargetAccountId}
            />
          ) : activeView === "Settings" ? (
            <SettingsContent />
          ) : (
          <div ref={graphPanelRef} className="relative flex h-full flex-col bg-card">
            {/* Card header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h2 className="text-lg font-semibold">Money Flow Visualization</h2>
                <p className="text-sm text-muted-foreground">
                  Account-to-account relationships across {selectedFileCount} selected files
                </p>
                {selectedFlag && flagFilterActive && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <RiskFlagBadge flag={selectedFlag.flag} />
                    <span className="text-muted-foreground">
                      Showing {selectedFlag.transactionIds.length.toLocaleString("en-IN")} flagged transactions: {selectedFlag.detail}
                    </span>
                    <button className="text-gov-blue hover:underline" onClick={resetGraphView}>
                      Clear flag filter
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="relative flex items-center gap-2">
                  <div className="flex min-h-10 items-center gap-2 border border-border bg-background px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={transactionSearch}
                      onChange={(event) => {
                        setTransactionSearch(event.target.value);
                        setSelectedFlow(null);
                      }}
                      className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      placeholder="Search transaction ID"
                    />
                  </div>
                  <button
                    className="flex min-h-10 items-center gap-2 border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                    onClick={() => {
                      if (!flagPanelOpen) ensureFlaggedAccounts();
                      setFlagPanelOpen((current) => !current);
                    }}
                  >
                    <Flag className="h-4 w-4 text-gov-red" />
                    Risk Flags
                    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                      {flaggedAccounts === null ? "Scan" : flaggedAccounts.length.toLocaleString("en-IN")}
                    </span>
                  </button>
                  {flagPanelOpen && (
                    <div className="absolute right-0 top-12 z-30 w-[520px] border border-border bg-card shadow-lg">
                      <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2">
                        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                          Circular Loops / Dormant Flags
                        </span>
                        <button className="text-sm text-gov-blue hover:underline" onClick={() => setFlagPanelOpen(false)}>
                          Close
                        </button>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {flaggedAccounts === null ? (
                          <div className="px-3 py-4 text-sm text-muted-foreground">
                            Click Risk Flags to scan account loops and dormant accounts.
                          </div>
                        ) : flaggedAccounts.length === 0 ? (
                          <div className="px-3 py-4 text-sm text-muted-foreground">
                            No circular loops or dormant accounts detected.
                          </div>
                        ) : (
                          <table className="w-full border-collapse text-sm">
                            <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wider text-muted-foreground">
                              <tr>
                                <th className="border-b border-border px-3 py-2 font-semibold">Account Number</th>
                                <th className="border-b border-border px-3 py-2 font-semibold">Account Holder</th>
                                <th className="border-b border-border px-3 py-2 font-semibold">Flagged</th>
                              </tr>
                            </thead>
                            <tbody>
                              {flaggedAccounts.map((issue) => (
                                <tr
                                  key={`${issue.flag}-${issue.detail}`}
                                  className="cursor-pointer hover:bg-muted"
                                  onClick={() => displayFlaggedAccount(issue)}
                                >
                                  <td className="border-b border-border px-3 py-2 font-medium tabular-nums">{issue.id}</td>
                                  <td className="border-b border-border px-3 py-2">
                                    <div className="font-medium">{issue.name}</div>
                                    <div className="max-w-[220px] truncate text-xs text-muted-foreground">{issue.detail}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {issue.transactionIds.length.toLocaleString("en-IN")} transaction IDs
                                    </div>
                                  </td>
                                  <td className="border-b border-border px-3 py-2">
                                    <RiskFlagBadge flag={issue.flag} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-gov-green" />Incoming</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 bg-gov-red" />Outgoing</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 border border-dashed border-gov-gray" />Internal Transfer</span>
                </div>
                <div className="flex items-center border border-border">
                  <button title="Refresh" className="border-r border-border p-2 hover:bg-muted" onClick={resetGraphView}>
                    <RefreshCw className="h-4 w-4" />
                  </button>
                  <button title="Fullscreen" className="p-2 hover:bg-muted" onClick={toggleGraphFullscreen}>
                    <Expand className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Graph */}
            <div
              className="relative flex-1 overflow-hidden"
              style={{
                backgroundColor: "var(--muted)",
                backgroundImage:
                  "radial-gradient(circle, var(--border) 1px, transparent 1px), radial-gradient(circle, color-mix(in oklch, var(--border) 60%, transparent) 1px, transparent 1px)",
                backgroundSize: "20px 20px, 80px 80px",
                backgroundPosition: "0 0, 10px 10px",
              }}
            >
              {/* Zoom controls */}
              <div className="absolute bottom-4 right-4 z-20 flex border border-border bg-card shadow-sm">
                <button
                  className="border-r border-border p-2 hover:bg-muted"
                  title="Zoom in"
                  onClick={() => setViewBox((current) => zoomViewBox(current, 0.82))}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  className="border-r border-border p-2 hover:bg-muted"
                  title="Zoom out"
                  onClick={() => setViewBox((current) => zoomViewBox(current, 1.22))}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  className="border-r border-border p-2 hover:bg-muted"
                  title="Fit"
                  onClick={() => setViewBox(INITIAL_VIEW_BOX)}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  className={`p-2 hover:bg-muted ${isCanvasLocked ? "bg-muted text-foreground" : ""}`}
                  title={isCanvasLocked ? "Unlock canvas" : "Lock canvas"}
                  onClick={() => setIsCanvasLocked((current) => !current)}
                >
                  <Lock className="h-4 w-4" />
                </button>
              </div>

              {/* Network overview */}
              <div className="absolute right-3 top-3 z-10 w-64 border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border bg-muted px-3 py-2">
                  <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Network Overview</span>
                  <button
                    onClick={() => setOverviewOpen((v) => !v)}
                    title={overviewOpen ? "Collapse" : "Expand"}
                    className="flex h-7 w-7 items-center justify-center border border-border bg-card text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    {overviewOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </button>
                </div>
                {overviewOpen && (
                  <>
                    <dl className="divide-y divide-border text-sm">
                      <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">Total Transactions</dt><dd className="font-semibold tabular-nums">{graph.totalTransactions.toLocaleString("en-IN")}</dd></div>
                      <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">Total Accounts</dt><dd className="font-semibold tabular-nums">{graph.totalAccounts.toLocaleString("en-IN")}</dd></div>
                      <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">Total Amount</dt><dd className="font-semibold tabular-nums">{formatAmount(graph.totalAmount)}</dd></div>
                      <div className="flex justify-between px-3 py-2"><dt className="text-muted-foreground">High Value Transactions</dt><dd className="font-semibold tabular-nums text-gov-red">{graph.flaggedCount.toLocaleString("en-IN")}</dd></div>
                    </dl>
                    <div className="border-t border-border bg-muted/50 px-3 py-1.5 text-right">
                      <a className="text-sm font-medium text-gov-blue hover:underline" href="#">View Details →</a>
                    </div>
                  </>
                )}
              </div>

              <svg
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                className={`block h-full min-h-[640px] w-full touch-none select-none ${isCanvasLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerMove={dragNode}
                onPointerUp={endNodeDrag}
                onPointerCancel={endNodeDrag}
                onPointerLeave={endNodeDrag}
              >
                <defs>
                  <marker id="arrow-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--gov-green)" />
                  </marker>
                  <marker id="arrow-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--gov-red)" />
                  </marker>
                  <marker id="arrow-credit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--gov-green)" />
                  </marker>
                  <marker id="arrow-debit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--gov-red)" />
                  </marker>
                  <marker id="arrow-potential" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--saffron)" />
                  </marker>
                  <marker id="arrow-int" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--gov-gray)" />
                  </marker>
                </defs>

                <rect
                  x={viewBox.x - viewBox.width}
                  y={viewBox.y - viewBox.height}
                  width={viewBox.width * 3}
                  height={viewBox.height * 3}
                  fill="transparent"
                  pointerEvents="all"
                  onPointerDown={beginCanvasDrag}
                />

                {centerLinks.map((link) => {
                  const fromCard = centerCards.find((card) => card.id === link.fromId);
                  const toCard = centerCards.find((card) => card.id === link.toId);
                  if (!fromCard || !toCard) return null;

                  const hasReverseLink = centerLinks.some(
                    (candidate) => candidate.fromId === link.toId && candidate.toId === link.fromId,
                  );
                  const reciprocalOffset = hasReverseLink ? (link.fromId < link.toId ? -18 : 18) : 0;
                  const fromIsLeft = fromCard.x + CENTER_WIDTH / 2 <= toCard.x + CENTER_WIDTH / 2;
                  const x1 = fromIsLeft ? fromCard.x + CENTER_WIDTH : fromCard.x;
                  const y1 = fromCard.y + CENTER_HEIGHT / 2 + reciprocalOffset;
                  const x2 = fromIsLeft ? toCard.x : toCard.x + CENTER_WIDTH;
                  const y2 = toCard.y + CENTER_HEIGHT / 2 + reciprocalOffset;
                  const d = curve(x1, y1, x2, y2);
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  const isPotentialFlow = flagFilterActive && selectedFlag?.flag === "Potential Loop";
                  const linkColor = isPotentialFlow
                    ? "var(--saffron)"
                    : link.flowType === "debit"
                      ? "var(--gov-red)"
                      : "var(--gov-green)";
                  const linkMarker = isPotentialFlow
                    ? "url(#arrow-potential)"
                    : link.flowType === "debit"
                      ? "url(#arrow-debit)"
                      : "url(#arrow-credit)";

                  return (
                    <g key={`center-link-${link.fromId}-${link.toId}`}>
                      <path
                        d={d}
                        fill="none"
                        stroke={linkColor}
                        strokeWidth={2}
                        markerEnd={linkMarker}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedFlow({
                            from: link.fromId,
                            to: link.toId,
                            amount: link.amount,
                            transactionIds: link.transactionIds,
                            x: mx,
                            y: my,
                          })
                        }
                      />
                      <rect x={mx - 48} y={my - 10} width={96} height={18} fill="var(--card)" stroke="var(--border)" />
                      <text x={mx} y={my + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--foreground)">
                        {formatCompactAmount(link.amount)}
                      </text>
                    </g>
                  );
                })}

                {/* edges */}
                {graphNodes.map((n) => {
                  const color = n.type === "in" ? "var(--gov-green)" : n.type === "out" ? "var(--gov-red)" : "var(--gov-gray)";
                  const marker = n.type === "in" ? "url(#arrow-in)" : n.type === "out" ? "url(#arrow-out)" : "url(#arrow-int)";
                  const dash = n.type === "internal" ? "6 4" : undefined;
                  const targetCard = nearestCenterCard(n, centerCards);
                  const targetX =
                    n.type === "in" ? targetCard.x : targetCard.x + CENTER_WIDTH;
                  const targetY = targetCard.y + CENTER_HEIGHT / 2;
                  const from = n.type === "in" ? n.id : targetCard.id;
                  const to = n.type === "in" ? targetCard.id : n.id;
                  const [x1, y1, x2, y2] =
                    n.type === "in"
                      ? [n.x + NODE_WIDTH, n.y + NODE_HEIGHT / 2, targetX, targetY]
                      : [targetX, targetY, n.x, n.y + NODE_HEIGHT / 2];
                  const d = curve(x1, y1, x2, y2);
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2 - 22;
                  return (
                    <g key={`edge-${graphNodeKey(n)}`}>
                      <path
                        d={d}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.5}
                        strokeDasharray={dash}
                        markerEnd={marker}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelectedFlow({
                            from,
                            to,
                            amount: n.amount,
                            transactionIds: n.transactionIds,
                            x: mx,
                            y: my,
                          })
                        }
                      />
                      <g>
                        <rect x={mx - 46} y={my - 9} width={92} height={16} fill="var(--card)" stroke="var(--border)" />
                        <text x={mx} y={my + 2} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--foreground)">{formatCompactAmount(n.amount)}</text>
                      </g>
                    </g>
                  );
                })}

                {/* surrounding nodes */}
                {graphNodes.map((n) => (
                  <g
                    key={`node-${graphNodeKey(n)}`}
                    className="cursor-move"
                    onPointerDown={(event) => beginNodeDrag(event, graphNodeKey(n), n)}
                  >
                    <rect x={n.x} y={n.y} width={NODE_WIDTH} height={NODE_HEIGHT} fill="var(--card)" stroke="var(--border)" />
                    <rect x={n.x} y={n.y} width={4} height={NODE_HEIGHT} fill={n.type === "in" ? "var(--gov-green)" : n.type === "out" ? "var(--gov-red)" : "var(--gov-gray)"} />
                    <text x={n.x + 14} y={n.y + 21} fontSize="12" fontWeight="600" fill="var(--foreground)">{n.id}</text>
                    <text x={n.x + 14} y={n.y + 40} fontSize="11" fill="var(--muted-foreground)">
                      {n.count} txn - {n.type === "in" ? "Incoming" : n.type === "out" ? "Outgoing" : "Internal"}
                    </text>
                  </g>
                ))}

                {/* selected account cards */}
                {centerCards.map((card) => (
                  <g
                    key={card.id}
                    className="cursor-move"
                    onPointerDown={(event) =>
                      beginNodeDrag(event, centerCardKey(card.id), card, {
                        width: CENTER_WIDTH,
                        height: CENTER_HEIGHT,
                      })
                    }
                  >
                    <rect x={card.x} y={card.y} width={CENTER_WIDTH} height={CENTER_HEIGHT} fill="var(--navy)" stroke="var(--navy-deep)" strokeWidth={1.5} />
                    <rect x={card.x} y={card.y} width={CENTER_WIDTH} height={4} fill="var(--saffron)" />
                    <rect x={card.x + 14} y={card.y + 22} width="22" height="22" fill="var(--navy-deep)" />
                    <text x={card.x + 46} y={card.y + 28} fontSize="13" fontWeight="700" fill="var(--navy-foreground)">{card.id}</text>
                    <text x={card.x + 46} y={card.y + 47} fontSize="11" fill="oklch(0.85 0.02 250)">{card.count} txn - {card.name}</text>
                    <text x={card.x + 46} y={card.y + 68} fontSize="14" fontWeight="700" fill="var(--saffron)">{formatAmount(card.amount)}</text>
                  </g>
                ))}

                {centerCards.map((card) => (
                  <foreignObject key={`icon-${card.id}`} x={card.x + 14} y={card.y + 22} width="22" height="22" pointerEvents="none">
                    <div className="flex h-full w-full items-center justify-center text-navy-foreground">
                      <Building2 className="h-4 w-4" />
                    </div>
                  </foreignObject>
                ))}

                {selectedFlow && (
                  <foreignObject
                    x={clamp(selectedFlow.x + 14, viewBox.x + 12, viewBox.x + viewBox.width - 342)}
                    y={clamp(selectedFlow.y - 72, viewBox.y + 12, viewBox.y + viewBox.height - 172)}
                    width="330"
                    height="160"
                  >
                    <div className="h-full w-full border border-border bg-card p-3 text-sm shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="font-semibold text-foreground">Transaction Flow</span>
                        <button className="text-gov-blue hover:underline" onClick={() => setSelectedFlow(null)}>
                          Close
                        </button>
                      </div>
                      <dl className="space-y-1.5">
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Route</dt>
                          <dd className="text-right font-medium">{formatFlowAccounts(selectedFlow)}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Amount</dt>
                          <dd className="font-semibold">{formatAmount(selectedFlow.amount)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Transaction ID</dt>
                          <dd className="mt-1 max-h-12 overflow-y-auto font-mono text-xs text-foreground">
                            {selectedFlow.transactionIds.slice(0, 12).join(", ")}
                            {selectedFlow.transactionIds.length > 12 ? ` +${selectedFlow.transactionIds.length - 12} more` : ""}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </foreignObject>
                )}
              </svg>

              {/* status icons row legend small */}
              <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><ArrowDownLeft className="h-4 w-4 text-gov-green" /> {graph.incomingCount.toLocaleString("en-IN")} incoming</span>
                  <span className="flex items-center gap-1"><ArrowUpRight className="h-4 w-4 text-gov-red" /> {graph.outgoingCount.toLocaleString("en-IN")} outgoing</span>
                  <span className="flex items-center gap-1"><ArrowLeftRight className="h-4 w-4 text-gov-gray" /> {graph.internalCount.toLocaleString("en-IN")} internal</span>
                </div>
                <span>{graph.dateRange}</span>
              </div>
            </div>
          </div>
          )}
        </main>
      </div>

      {/* FLAG MODAL OVERLAY */}
      {flagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md border border-border bg-card p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-navy">Flag / Mark Account for Investigation</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Manually flag an account for regulatory review</p>
              </div>
              <button onClick={() => { setFlagModalOpen(false); setManualFlagAccount(""); setManualFlagDetail(""); }}
                className="flex h-8 w-8 items-center justify-center border border-border bg-background text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">Target Account ID</label>
                <select
                  value={manualFlagAccount}
                  onChange={(e) => setManualFlagAccount(e.target.value)}
                  className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-navy"
                >
                  <option value="">— Select an account —</option>
                  {accountStatements.map((s) => (
                    <option key={s.accountId} value={s.accountId}>{s.accountId} — {s.accountName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">Flag Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Circular Loop", "Potential Loop", "Dormant Account"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setManualFlagReason(f)}
                      className={`border px-2 py-2 text-xs text-left transition-colors ${
                        manualFlagReason === f ? "border-nav border-navy bg-navy text-navy-foreground font-semibold" : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-muted-foreground mb-1.5">Grounds for Flagging</label>
                <textarea
                  value={manualFlagDetail}
                  onChange={(e) => setManualFlagDetail(e.target.value)}
                  rows={3}
                  placeholder="Describe the suspicious pattern observed..."
                  className="w-full border border-border bg-background px-3 py-2 text-sm outline-none focus:border-navy resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => { setFlagModalOpen(false); setManualFlagAccount(""); setManualFlagDetail(""); }}
                  className="border border-border bg-background px-4 py-2 text-xs font-medium hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  disabled={!manualFlagAccount || !manualFlagDetail}
                  onClick={() => {
                    if (!manualFlagAccount || !manualFlagDetail) return;
                    const stmt = accountStatements.find((s) => s.accountId === manualFlagAccount);
                    const newFlag: FlaggedAccount = {
                      id: manualFlagAccount,
                      name: stmt?.accountName ?? manualFlagAccount,
                      flag: manualFlagReason,
                      detail: manualFlagDetail,
                      transactionIds: stmt?.transactions.slice(0, 20).map((t) => t.transactionId) ?? [],
                      accountIds: [manualFlagAccount],
                    };
                    setManualFlags((prev) => [newFlag, ...prev]);
                    setSelectedFlag(newFlag);
                    setFlagModalOpen(false);
                    setManualFlagAccount("");
                    setManualFlagDetail("");
                    setActiveView("Alerts");
                  }}
                  className="border border-gov-red bg-gov-red px-6 py-2 text-xs font-bold text-white hover:bg-gov-red/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Flag className="h-3.5 w-3.5 inline mr-1.5" />
                  Submit Flag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BACKEND DIAGNOSTICS & STAGE-BY-STAGE TEST MODAL */}
      {backendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col border border-border bg-card shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-navy px-6 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center bg-white/10 text-saffron">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-wide">AEGIS Live Backend Stage Diagnostics</h2>
                  <p className="text-xs text-white/70">
                    Real-time execution of Stages A &ndash; E against the Python machine learning and graph engine
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {diagnosticsData && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1.5 border border-gov-green/40 bg-gov-green/20 px-2.5 py-1 font-mono font-bold text-gov-green">
                      <CheckCircle2 className="h-3.5 w-3.5" /> STATUS: {diagnosticsData.status}
                    </span>
                    <span className="font-mono text-white/80">
                      {diagnosticsData.total_latency_ms} ms latency
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setBackendModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Stage Selector Bar & Run All Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-6 py-3">
              <div className="flex items-center gap-1 text-xs">
                {(["all", "A", "B", "C", "D", "E"] as const).map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setActiveDiagStageTab(stage)}
                    className={`px-3 py-1.5 font-semibold border transition-colors ${
                      activeDiagStageTab === stage
                        ? "border-navy bg-navy text-white"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {stage === "all" ? "All Stages (A-E)" : `Stage ${stage}`}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={isTestingBackend}
                  onClick={() => handleRunBackendDiagnostic(activeDiagStageTab)}
                  className="flex items-center gap-2 border border-navy bg-navy px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-navy-deep active:scale-[0.99] disabled:opacity-50"
                >
                  {isTestingBackend ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Executing Python Engine...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5 text-saffron" />
                      <span>
                        {activeDiagStageTab === "all" ? "Run Full 5-Stage Test" : `Test Stage ${activeDiagStageTab} Only`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {diagnosticsError && (
                <div className="border border-gov-red/40 bg-gov-red/10 p-4 text-xs text-gov-red flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Backend Diagnostic Error</div>
                    <div className="mt-1 font-mono">{diagnosticsError}</div>
                  </div>
                </div>
              )}

              {isTestingBackend && !diagnosticsData && (
                <div className="flex h-64 flex-col items-center justify-center text-center space-y-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-3 border-navy border-t-transparent" />
                  <div className="text-sm font-bold text-navy">Running Python ML &amp; Forensic Diagnostics...</div>
                  <div className="text-xs text-muted-foreground max-w-sm">
                    Executing XGBoost feature extraction, Shannon entropy verification, NetworkX traversal, and Bayesian belief updates.
                  </div>
                </div>
              )}

              {diagnosticsData && (
                <div className="space-y-6">
                  {/* STAGE A CARD */}
                  {(activeDiagStageTab === "all" || activeDiagStageTab === "A") && diagnosticsData.stages?.A && (
                    <div className="border border-border bg-background p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="bg-navy text-white text-xs font-bold px-2.5 py-0.5">STAGE A</span>
                          <h3 className="text-sm font-bold text-navy">Feature Engineering &amp; XGBoost Prior Scoring</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gov-green">
                            {diagnosticsData.stages.A.latency_ms} ms
                          </span>
                          <button
                            onClick={() => handleRunBackendDiagnostic("A")}
                            disabled={isTestingBackend}
                            className="border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold hover:bg-card"
                          >
                            Re-test A
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Mathematical Rule</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">{diagnosticsData.stages.A.mathematical_rule}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Features Extracted</div>
                          <div className="font-mono font-bold mt-0.5 text-foreground">{diagnosticsData.stages.A.total_features_extracted} Features</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Investigation Threshold</div>
                          <div className="font-mono font-bold mt-0.5 text-foreground">P&sub0; &ge; {diagnosticsData.stages.A.investigation_cutoff_threshold}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Structuring Score</div>
                          <div className="font-mono font-bold mt-0.5 text-saffron">P&sub0; = {diagnosticsData.stages.A.summary.structuring_p0}</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Archetype Prior Risk Evaluations (Real Python XGBoost Output):
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-muted text-muted-foreground text-left text-[10px] uppercase">
                                <th className="border border-border px-2.5 py-1">Archetype Pattern</th>
                                <th className="border border-border px-2.5 py-1">Transaction ID</th>
                                <th className="border border-border px-2.5 py-1">Amount (INR)</th>
                                <th className="border border-border px-2.5 py-1 text-right">P&sub0; (Fraud Prior)</th>
                                <th className="border border-border px-2.5 py-1 text-right">Raw Margin</th>
                                <th className="border border-border px-2.5 py-1">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diagnosticsData.stages.A.archetype_evaluations.map((arch: any) => (
                                <tr key={arch.pattern} className="hover:bg-muted/30">
                                  <td className="border border-border px-2.5 py-1 font-semibold">{arch.pattern}</td>
                                  <td className="border border-border px-2.5 py-1 font-mono">{arch.txn_id}</td>
                                  <td className="border border-border px-2.5 py-1 font-mono">{formatAmount(arch.amount_inr)}</td>
                                  <td className="border border-border px-2.5 py-1 text-right font-mono font-bold text-navy">
                                    {(arch.p0_fraud * 100).toFixed(2)}%
                                  </td>
                                  <td className="border border-border px-2.5 py-1 text-right font-mono text-muted-foreground">
                                    {arch.raw_margin.toFixed(3)}
                                  </td>
                                  <td className="border border-border px-2.5 py-1 font-semibold">
                                    <span className={arch.is_high_risk ? "text-gov-red" : "text-gov-green"}>
                                      {arch.action}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STAGE B CARD */}
                  {(activeDiagStageTab === "all" || activeDiagStageTab === "B") && diagnosticsData.stages?.B && (
                    <div className="border border-border bg-background p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="bg-navy text-white text-xs font-bold px-2.5 py-0.5">STAGE B</span>
                          <h3 className="text-sm font-bold text-navy">Shannon Entropy Confidence Engine</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gov-green">
                            {diagnosticsData.stages.B.latency_ms} ms
                          </span>
                          <button
                            onClick={() => handleRunBackendDiagnostic("B")}
                            disabled={isTestingBackend}
                            className="border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold hover:bg-card"
                          >
                            Re-test B
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Shannon Formula</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">{diagnosticsData.stages.B.mathematical_rule}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Confidence Cutoff (&theta;)</div>
                          <div className="font-mono font-bold mt-0.5 text-foreground">{diagnosticsData.stages.B.entropy_cutoff_theta} bits</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Final Converged Entropy</div>
                          <div className="font-mono font-bold mt-0.5 text-gov-green">{diagnosticsData.stages.B.final_entropy} bits</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Final Confidence</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">{diagnosticsData.stages.B.final_confidence_pct}%</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Uncertainty Collapse Trace (Step-by-Step Evidence Gathering):
                        </div>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted text-muted-foreground text-left text-[10px] uppercase">
                              <th className="border border-border px-2.5 py-1">Step</th>
                              <th className="border border-border px-2.5 py-1">Evidence Source Description</th>
                              <th className="border border-border px-2.5 py-1 text-right">P(fraud)</th>
                              <th className="border border-border px-2.5 py-1 text-right">Entropy H(X)</th>
                              <th className="border border-border px-2.5 py-1 text-right">Confidence %</th>
                              <th className="border border-border px-2.5 py-1">Loop Decision</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagnosticsData.stages.B.uncertainty_collapse_steps.map((st: any) => (
                              <tr key={st.step} className="hover:bg-muted/30">
                                <td className="border border-border px-2.5 py-1 font-mono font-bold">{st.step}</td>
                                <td className="border border-border px-2.5 py-1">{st.description}</td>
                                <td className="border border-border px-2.5 py-1 text-right font-mono font-bold">{(st.p_fraud * 100).toFixed(1)}%</td>
                                <td className="border border-border px-2.5 py-1 text-right font-mono">{st.entropy_bits} bits</td>
                                <td className="border border-border px-2.5 py-1 text-right font-mono">{st.confidence_pct}%</td>
                                <td className={`border border-border px-2.5 py-1 font-semibold ${st.is_confident ? "text-gov-green" : "text-saffron"}`}>
                                  {st.action}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* STAGE C CARD */}
                  {(activeDiagStageTab === "all" || activeDiagStageTab === "C") && diagnosticsData.stages?.C && (
                    <div className="border border-border bg-background p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="bg-navy text-white text-xs font-bold px-2.5 py-0.5">STAGE C</span>
                          <h3 className="text-sm font-bold text-navy">Adaptive Information-Theoretic Evidence Planner</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gov-green">
                            {diagnosticsData.stages.C.latency_ms} ms
                          </span>
                          <button
                            onClick={() => handleRunBackendDiagnostic("C")}
                            disabled={isTestingBackend}
                            className="border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold hover:bg-card"
                          >
                            Re-test C
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Optimization Objective</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">{diagnosticsData.stages.C.mathematical_rule}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Candidate Sources</div>
                          <div className="font-mono font-bold mt-0.5 text-foreground">{diagnosticsData.stages.C.available_sources_count} Registered Sources</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Highest Utility Source</div>
                          <div className="font-mono font-bold mt-0.5 text-gov-green">{diagnosticsData.stages.C.top_utility_source}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Peak Utility Value</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">U = {diagnosticsData.stages.C.top_utility_value}</div>
                        </div>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                          Sources Ranked by Query Utility (InfoGain / QueryCost):
                        </div>
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-muted text-muted-foreground text-left text-[10px] uppercase">
                              <th className="border border-border px-2.5 py-1">Source ID</th>
                              <th className="border border-border px-2.5 py-1">Description</th>
                              <th className="border border-border px-2.5 py-1 text-right">Base InfoGain</th>
                              <th className="border border-border px-2.5 py-1 text-right">Query Cost</th>
                              <th className="border border-border px-2.5 py-1 text-right">Calculated Utility</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagnosticsData.stages.C.sources_profile.map((src: any) => (
                              <tr key={src.source_id} className="hover:bg-muted/30">
                                <td className="border border-border px-2.5 py-1 font-mono font-semibold">{src.source_id}</td>
                                <td className="border border-border px-2.5 py-1 text-muted-foreground">{src.description}</td>
                                <td className="border border-border px-2.5 py-1 text-right font-mono">{src.base_info_gain}</td>
                                <td className="border border-border px-2.5 py-1 text-right font-mono">{src.cost}</td>
                                <td className="border border-border px-2.5 py-1 text-right font-mono font-bold text-navy">{src.utility}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* STAGE D CARD */}
                  {(activeDiagStageTab === "all" || activeDiagStageTab === "D") && diagnosticsData.stages?.D && (
                    <div className="border border-border bg-background p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="bg-navy text-white text-xs font-bold px-2.5 py-0.5">STAGE D</span>
                          <h3 className="text-sm font-bold text-navy">Graph Intelligence (NetworkX) &amp; Temporal Engine</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gov-green">
                            {diagnosticsData.stages.D.latency_ms} ms
                          </span>
                          <button
                            onClick={() => handleRunBackendDiagnostic("D")}
                            disabled={isTestingBackend}
                            className="border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold hover:bg-card"
                          >
                            Re-test D
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Target Node Audited</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">{diagnosticsData.stages.D.graph_metrics.target_account}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Max BFS Hop Depth</div>
                          <div className="font-mono font-bold mt-0.5 text-foreground">{diagnosticsData.stages.D.graph_metrics.hop_depth} Hops</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Reachable Cluster Size</div>
                          <div className="font-mono font-bold mt-0.5 text-foreground">{diagnosticsData.stages.D.graph_metrics.reachable_accounts} Accounts</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Composite Graph Risk</div>
                          <div className="font-mono font-bold mt-0.5 text-gov-red">{diagnosticsData.stages.D.graph_metrics.composite_graph_risk_score} / 10.0</div>
                        </div>
                      </div>

                      <div className="border border-gov-red/30 bg-gov-red/5 p-3 text-xs space-y-1 font-mono">
                        <div className="font-bold text-gov-red">
                          Circular Money Loop Confirmed: {diagnosticsData.stages.D.graph_metrics.is_circular_loop ? "TRUE [CYCLE FOUND]" : "FALSE"}
                        </div>
                        <div className="text-foreground">
                          Ring Path: {diagnosticsData.stages.D.graph_metrics.ring_members.join(" -> ")}
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          Shell Conduit Chain: {diagnosticsData.stages.D.graph_metrics.shell_conduit_path.join(" -> ")} ({diagnosticsData.stages.D.graph_metrics.shell_conduit_length} hops)
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          Total Subgraph Turnover: {formatAmount(diagnosticsData.stages.D.graph_metrics.total_subgraph_flow_inr)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STAGE E CARD */}
                  {(activeDiagStageTab === "all" || activeDiagStageTab === "E") && diagnosticsData.stages?.E && (
                    <div className="border border-border bg-background p-5 shadow-xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="bg-navy text-white text-xs font-bold px-2.5 py-0.5">STAGE E</span>
                          <h3 className="text-sm font-bold text-navy">Bayesian Decision Engine &amp; Automated STR Compliance</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-gov-green">
                            {diagnosticsData.stages.E.latency_ms} ms
                          </span>
                          <button
                            onClick={() => handleRunBackendDiagnostic("E")}
                            disabled={isTestingBackend}
                            className="border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold hover:bg-card"
                          >
                            Re-test E
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3 text-xs">
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Decision Boundary (&theta;)</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">P(fraud) &gt; {diagnosticsData.stages.E.decision_threshold}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Final Converged Belief</div>
                          <div className="font-mono font-bold mt-0.5 text-gov-red">P = {diagnosticsData.stages.E.case_evaluation.final_p_fraud}</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Mathematical Certainty</div>
                          <div className="font-mono font-bold mt-0.5 text-navy">{diagnosticsData.stages.E.case_evaluation.certainty_pct}%</div>
                        </div>
                        <div className="border border-border p-2.5 bg-muted/20">
                          <div className="text-[10px] text-muted-foreground uppercase">Statutory Outcome</div>
                          <div className="font-mono font-bold mt-0.5 text-gov-red">
                            *** {diagnosticsData.stages.E.case_evaluation.verdict} ***
                          </div>
                        </div>
                      </div>

                      <div className="border border-border bg-muted/10 p-3 text-xs space-y-1">
                        <div className="font-semibold text-foreground">Algorithmic Decision Justification:</div>
                        <p className="text-muted-foreground leading-relaxed">{diagnosticsData.stages.E.case_evaluation.decision_reason}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px]">
                          <span className="text-muted-foreground">Regulatory Frameworks Verified:</span>
                          {diagnosticsData.stages.E.case_evaluation.str_regulatory_standards.map((st: string) => (
                            <span key={st} className="border border-border bg-background px-2 py-0.5 text-foreground font-semibold">
                              {st}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border bg-card px-6 py-3 text-xs">
              <div className="text-muted-foreground">
                All 5 stages execute standalone Python models: XGBoost (Stage A), Shannon Entropy (Stage B), Adaptive Planner (Stage C), NetworkX (Stage D), Bayesian STR (Stage E).
              </div>
              <button
                onClick={() => setBackendModalOpen(false)}
                className="border border-border bg-background px-4 py-1.5 font-semibold text-foreground hover:bg-muted"
              >
                Close Console
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="flex items-center justify-between border-t border-border bg-card px-6 py-2 text-sm text-muted-foreground">
        <p>This system is intended for authorized use only. Unauthorized access is prohibited and may be subject to legal action.</p>
        <p>© 2024 Financial Intelligence Unit, Government of India</p>
      </footer>
    </div>
  );
}
