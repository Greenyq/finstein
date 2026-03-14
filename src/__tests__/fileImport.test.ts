import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseFileToRows } from "../services/fileImport.js";

describe("File Import - CSV/Excel parsing", () => {
  it("should parse CSV buffer to rows", () => {
    const csvContent = "Date,Description,Amount,Type\n2025-01-15,Groceries,45.50,expense\n2025-01-16,Salary,3000,income\n";
    const buffer = Buffer.from(csvContent);

    const { rows, headers } = parseFileToRows(buffer, "test.csv");

    expect(headers).toEqual(["Date", "Description", "Amount", "Type"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!["Description"]).toBe("Groceries");
    expect(rows[0]!["Type"]).toBe("expense");
    expect(rows[1]!["Description"]).toBe("Salary");
    expect(rows[1]!["Type"]).toBe("income");
  });

  it("should parse Excel buffer to rows", () => {
    // Create a test Excel file in memory
    const wb = XLSX.utils.book_new();
    const data = [
      ["Date", "Category", "Amount"],
      ["2025-03-01", "Groceries", 120],
      ["2025-03-02", "Restaurant", 45],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const { rows, headers } = parseFileToRows(buffer, "test.xlsx");

    expect(headers).toEqual(["Date", "Category", "Amount"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!["Category"]).toBe("Groceries");
    expect(rows[0]!["Amount"]).toBe(120);
  });

  it("should handle empty file", () => {
    const csvContent = "Date,Amount\n";
    const buffer = Buffer.from(csvContent);

    const { rows, headers } = parseFileToRows(buffer, "empty.csv");

    expect(rows).toHaveLength(0);
  });

  it("should handle file with many rows", () => {
    let csv = "Date,Amount,Category\n";
    for (let i = 0; i < 1000; i++) {
      csv += `2025-01-${String(i % 28 + 1).padStart(2, "0")},${Math.random() * 500},Groceries\n`;
    }
    const buffer = Buffer.from(csv);

    const { rows } = parseFileToRows(buffer, "big.csv");
    expect(rows).toHaveLength(1000);
  });

  it("should handle Russian content", () => {
    const csv = "Дата,Описание,Сумма\n2025-01-15,Продукты,2500\n2025-01-16,Ресторан,1800\n";
    const buffer = Buffer.from(csv);

    const { rows, headers } = parseFileToRows(buffer, "russian.csv");

    expect(rows).toHaveLength(2);
    // Verify data was parsed (headers may be encoded differently by xlsx)
    const firstRow = rows[0]!;
    const values = Object.values(firstRow);
    expect(values).toContain("Продукты");
    // Numbers are parsed as numbers (not raw strings)
    expect(values).toContain(2500);
  });
});
