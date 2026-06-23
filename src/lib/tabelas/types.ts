export type ColumnType = "text" | "number" | "date" | "boolean";

export type SheetColumn = {
  key: string;
  label: string;
  type: ColumnType;
};
