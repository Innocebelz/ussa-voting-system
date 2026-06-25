export interface User {
  matNumber: string;
  hasVoted: boolean;
  name: string;
  userBallot?: Record<string, string>;
  ballotId?: string;    // anonymous UUID receipt returned after a successful vote
}

export interface Candidate {
  id: string;
  name: string;
  manifesto: string;
  image: string;
}

export interface ElectionCategory {
  position: string;   // Display name shown on the ballot
  dbKey: string;      // Database column name — never change this once votes are cast
  unopposed: boolean;
  candidates: Candidate[];
}