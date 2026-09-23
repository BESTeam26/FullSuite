/**
 * Clicking a control in a list row edits it. Clicking the row opens the file.
 *
 * This is the rule Dee asked for repeatedly — "on the actual list i should be
 * able to change the drop down" — and it was broken for weeks in a way that
 * looked exactly like the feature not existing.
 *
 * The cell stopped the row's click handler only when the CLICKED ELEMENT'S OWN
 * tagName was BUTTON/INPUT/SELECT/OPTION. Every control in these tables wraps
 * its value, so a click on a status pill has `target` = the <span> inside the
 * button. The tag read SPAN, the click was not stopped, the row handler won,
 * and the file opened. Every inline editor in the table was unreachable.
 *
 * So the test is written against the SHAPE that broke it — a label nested
 * inside the control — rather than against a bare button, which passed the old
 * code perfectly well.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/** The cell's guard, exactly as both tables spell it. */
const CONTROLS =
  'button, input, select, textarea, a, label, [role="combobox"], [role="listbox"], [role="option"], [contenteditable="true"]';

function Row({ onOpen, onEdit }: { onOpen: () => void; onEdit: () => void }) {
  return (
    <table>
      <tbody>
        <tr onClick={onOpen}>
          <td
            onClick={(e) => {
              if ((e.target as HTMLElement).closest(CONTROLS)) e.stopPropagation();
            }}
          >
            {/* The real shape: the label is a SPAN inside the BUTTON. */}
            <button onClick={onEdit}>
              <span data-testid="pill">For Complaints</span>
            </button>
          </td>
          <td
            onClick={(e) => {
              if ((e.target as HTMLElement).closest(CONTROLS)) e.stopPropagation();
            }}
          >
            <span data-testid="plain">Round 2</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

describe("a click on a control reaches the control", () => {
  it("edits the status and does NOT open the file, clicking the label inside the button", () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    render(<Row onOpen={onOpen} onEdit={onEdit} />);

    /* The pixel a person actually hits. Under the old tagName check this
       opened the file and the dropdown never appeared. */
    fireEvent.click(screen.getByTestId("pill"));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("still opens the file from a cell that holds no control", () => {
    const onOpen = vi.fn();
    const onEdit = vi.fn();
    render(<Row onOpen={onOpen} onEdit={onEdit} />);

    fireEvent.click(screen.getByTestId("plain"));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("the guard both tables use has not gone back to reading tagName", async () => {
    /* The regression would not be a failing click test — it would be somebody
       "simplifying" the selector back. Both files are checked by name. */
    const fs = await import("node:fs");
    for (const file of [
      "src/components/dashboard/fulfillment/OpsClientListTable.tsx",
      "src/components/dashboard/fulfillment/OpsGlobalQueue.tsx",
    ]) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, `${file} must not gate row clicks on tagName`).not.toMatch(/\.tagName/);
      expect(src, `${file} must use closest() to find the control`).toMatch(/closest\(/);
    }
  });
});
