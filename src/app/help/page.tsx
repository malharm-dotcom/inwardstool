import Link from "next/link";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { pageUser } from "@/lib/api";

export default async function HelpPage() {
  return (
    <Shell user={await pageUser()}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ON THE RECEIVING FLOOR</div>
          <h1>Ready, set, scan.</h1>
          <p className="muted">A quick guide for a smooth receiving shift.</p>
        </div>
        <Link href="/" className="button secondary">
          Back to receiving
          <Icon name="arrow" size={18} />
        </Link>
      </div>
      <div className="help-grid">
        <article className="panel prose">
          <Icon name="scan" size={30} />
          <h2>Handheld & USB scanners</h2>
          <ol>
            <li>
              Connect your USB or Bluetooth scanner, or open the app in your
              handheld browser.
            </li>
            <li>
              Use keyboard / HID mode. On Android enterprise devices, enable
              keyboard output in the scanner profile.
            </li>
            <li>
              Set the suffix to <strong>Enter</strong> or <strong>Tab</strong>.
            </li>
            <li>
              Create or open a receipt. Set the destination shelf, click the
              scan field and scan each tag once.
            </li>
          </ol>
          <p>
            Each completed scan counts one piece on the selected shelf. There
            are no confirmation prompts. Use <strong>Change shelf</strong> to
            send subsequent scans to another location.
          </p>
          <p>
            If focus moves away, select <strong>Resume scanning</strong>. Text
            inside a correction or another form is never treated as a scan.
          </p>
        </article>
        <article className="panel prose">
          <Icon name="clock" size={30} />
          <h2>Saving & connection issues</h2>
          <p>
            The pending counter tells you which scans are still being saved.
            Keep the page open until it shows <strong>All scans saved</strong>.
          </p>
          <p>
            If the connection drops, pending scans stay on this browser with the
            shelf selected when you scanned them. Restore the connection and
            select <strong>Retry pending scans</strong>. Retrying a saved scan
            does not add another unit.
          </p>
          <p>
            Use the same browser and staff account to recover pending work. Do
            not clear browser data while scans are pending. Scanning for the
            same receipt is limited to one tab per browser.
          </p>
        </article>
        <article className="panel prose">
          <Icon name="camera" size={30} />
          <h2>Occasional phone scanning</h2>
          <p>
            Select a destination shelf, then <strong>Use camera</strong> and
            grant camera permission. The app must use HTTPS (or localhost during
            development).
          </p>
          <p>
            Hold one barcode in view. After it counts, move the tag completely
            out of view for at least one second before showing the next one. No
            confirmation is needed.
          </p>
          <p>
            Camera decoding can miss or briefly lose a barcode. Review the
            totals; handheld scanners are the primary receiving method.
          </p>
        </article>
        <article className="panel prose">
          <Icon name="download" size={30} />
          <h2>Review & export</h2>
          <p>
            Use <strong>Correct</strong> to change a SKU quantity on one shelf
            and record a reason. Set it to zero to remove that line from the
            export; its history is retained.
          </p>
          <p>
            <strong>Finalize receipt</strong> locks quantities. Check that every
            operator has finished and all pending scans have saved first.
          </p>
          <p>
            The CSV matches your inventory-adjustment template:{" "}
            <strong>Adjustment Type, Product Code, Shelf Code, Quantity</strong>
            . Every row uses ADD and represents one SKU on one shelf.
          </p>
          <p>
            CSV downloads can be repeated. Upload each receipt only once:
            importing an ADD file again may add the stock twice in the
            destination system. A download does not indicate an import
            succeeded.
          </p>
        </article>
      </div>
    </Shell>
  );
}
