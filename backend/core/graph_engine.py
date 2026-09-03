"""
AEGIS — Graph Intelligence Engine (Stage D)
Uses NetworkX for BFS/DFS traversal of the transaction graph.
Detects:
  - Shell company chains (multi-hop paths to known bad actors)
  - Circular fund loops (DFS cycle detection)
  - Cross-entity network clusters
  - Ring participants for STR reporting
"""

import networkx as nx
import numpy as np
from collections import defaultdict


class GraphEngine:
    """
    Maintains an in-memory directed transaction graph.
    Nodes = account IDs
    Edges = transactions (weighted by amount, timestamped)
    """

    def __init__(self):
        self.G = nx.DiGraph()
        self._known_shell_accounts: set = set()
        self._watchlisted: set = set()

    def load_transactions(self, df, accounts_df=None):
        """Build the graph from a transactions DataFrame."""
        for _, row in df.iterrows():
            sender   = row["sender_id"]
            receiver = row["receiver_id"]
            amt      = row["amount_inr"]
            ts       = str(row["timestamp"])
            # Add edge; accumulate amount if multiple txns between same pair
            if self.G.has_edge(sender, receiver):
                self.G[sender][receiver]["total_amount"] += amt
                self.G[sender][receiver]["txn_count"]    += 1
                self.G[sender][receiver]["timestamps"].append(ts)
            else:
                self.G.add_edge(sender, receiver,
                                total_amount=amt,
                                txn_count=1,
                                timestamps=[ts])

        if accounts_df is not None:
            for _, row in accounts_df.iterrows():
                acc_id = row["id"]
                # Mark shell accounts
                if str(row.get("is_shell", "False")).lower() in ("true", "1"):
                    self._known_shell_accounts.add(acc_id)
                if str(row.get("watchlisted", "False")).lower() in ("true", "1"):
                    self._watchlisted.add(acc_id)
                # Set node attributes
                if acc_id in self.G:
                    self.G.nodes[acc_id]["is_shell"]    = acc_id in self._known_shell_accounts
                    self.G.nodes[acc_id]["watchlisted"] = acc_id in self._watchlisted

        print(f"  [Graph] Loaded {self.G.number_of_nodes():,} nodes, "
              f"{self.G.number_of_edges():,} edges")

    def analyze(self, account_id: str, max_hops: int = 8) -> dict:
        """
        Full graph analysis for a flagged account.

        Returns a dict with:
          - hop_depth: max depth reached
          - is_circular: bool — circular flow detected
          - circular_length: int — length of shortest cycle
          - ring_members: list of account IDs in the loop
          - shell_chain_length: int — longest path to a shell account
          - shell_chain_path: list of account IDs in the chain
          - reachable_accounts: int — total accounts reachable
          - reachable_watchlisted: int — watchlisted accounts in subgraph
          - total_flow_amount: float — total ₹ flowing through neighbourhood
          - graph_risk_score: float — composite graph risk [0, 10]
        """
        if account_id not in self.G:
            return self._empty_result(account_id)

        result = {
            "account_id":             account_id,
            "is_circular":            False,
            "circular_length":        0,
            "ring_members":           [],
            "hop_depth":              0,
            "shell_chain_length":     0,
            "shell_chain_path":       [],
            "reachable_accounts":     0,
            "reachable_watchlisted":  0,
            "total_flow_amount":      0.0,
            "graph_risk_score":       0.0,
        }

        # BFS - compute reachable subgraph within max_hops
        reachable_by_depth = {}
        for depth, layer in enumerate(nx.bfs_layers(self.G, [account_id])):
            if depth > max_hops:
                break
            for node in layer:
                reachable_by_depth[node] = depth

        result["hop_depth"]           = max(reachable_by_depth.values(), default=0)
        result["reachable_accounts"]  = len(reachable_by_depth)
        result["reachable_watchlisted"] = sum(
            1 for n in reachable_by_depth if n in self._watchlisted
        )

        # Total flow amount through neighbourhood
        subgraph_nodes = set(reachable_by_depth.keys())
        for u, v, data in self.G.edges(data=True):
            if u in subgraph_nodes or v in subgraph_nodes:
                result["total_flow_amount"] += data.get("total_amount", 0)

        # Circular flow detection - check if funds leaving account_id loop back to account_id
        try:
            cycles = []
            for succ in self.G.successors(account_id):
                if self.G.has_edge(succ, account_id):
                    cycles.append([account_id, succ, account_id])
                else:
                    try:
                        return_path = nx.shortest_path(self.G, succ, account_id)
                        cycles.append([account_id] + return_path)
                    except nx.NetworkXNoPath:
                        pass
            if cycles:
                result["is_circular"] = True
                shortest_cycle = min(cycles, key=len)
                result["circular_length"] = len(shortest_cycle) - 1
                result["ring_members"] = shortest_cycle
        except Exception:
            pass

        # Shell chain detection — BFS to find path to known shell accounts
        shell_paths = []
        for node in reachable_by_depth:
            if node in self._known_shell_accounts and node != account_id:
                try:
                    path = nx.shortest_path(self.G, account_id, node)
                    shell_paths.append(path)
                except nx.NetworkXNoPath:
                    pass
        if shell_paths:
            longest_chain     = max(shell_paths, key=len)
            result["shell_chain_length"] = len(longest_chain) - 1
            result["shell_chain_path"]   = longest_chain

        # Composite graph risk score [0–10]
        risk = 0.0
        risk += min(result["hop_depth"] * 0.3, 2.0)
        risk += 3.0 if result["is_circular"] else 0.0
        risk += min(result["shell_chain_length"] * 0.4, 2.5)
        risk += min(result["reachable_watchlisted"] * 0.8, 2.0)
        risk += min(result["total_flow_amount"] / 10_000_000, 0.5)
        result["graph_risk_score"] = round(min(risk, 10.0), 2)

        return result

    def _empty_result(self, account_id: str) -> dict:
        return {
            "account_id": account_id, "is_circular": False, "circular_length": 0,
            "ring_members": [], "hop_depth": 0, "shell_chain_length": 0,
            "shell_chain_path": [], "reachable_accounts": 0,
            "reachable_watchlisted": 0, "total_flow_amount": 0.0,
            "graph_risk_score": 0.0,
        }

    def get_subgraph_for_display(self, account_id: str, max_hops: int = 3) -> dict:
        """Return a lightweight node/edge list for dashboard rendering."""
        if account_id not in self.G:
            return {"nodes": [], "edges": []}
        nodes_in_range = {}
        for depth, layer in enumerate(nx.bfs_layers(self.G, [account_id])):
            if depth > max_hops:
                break
            for node in layer:
                nodes_in_range[node] = depth
        nodes = [
            {
                "id":    n,
                "depth": depth,
                "is_shell": n in self._known_shell_accounts,
                "watchlisted": n in self._watchlisted,
            }
            for n, depth in nodes_in_range.items()
        ]
        edges = [
            {
                "source": u, "target": v,
                "amount": round(data.get("total_amount", 0)),
                "count":  data.get("txn_count", 1),
            }
            for u, v, data in self.G.edges(data=True)
            if u in nodes_in_range and v in nodes_in_range
        ]
        return {"nodes": nodes, "edges": edges}
