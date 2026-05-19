
export interface Document {
  id: string;
  file_name: string;
  status: string;
  created_at: string;
  customer_name?: string;
  file_size?: number;
  summary?: string;
  tags?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  references?: { document_id: string; file_name: string }[];
}

export interface SortConfig {
  key: "file_name" | "created_at" | "type" | "tags" | "file_size" | "customer_name";
  label: string;
  order: "asc" | "desc";
}

export interface ColumnConfig {
  key: "file_name" | "created_at" | "type" | "tags" | "file_size" | "customer_name";
  label: string;
  width: string;
}
