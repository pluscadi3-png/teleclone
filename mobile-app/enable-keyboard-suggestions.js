const fs = require("fs");
const path = require("path");

const javaRoot = path.join("android", "app", "src", "main", "java");

function findMainActivity(dir) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(full);
      if (found) return found;
    } else if (entry.name === "MainActivity.java") {
      return full;
    }
  }
  return null;
}

const mainActPath = findMainActivity(javaRoot);
if (!mainActPath) {
  console.error("ERROR: MainActivity.java not found under", javaRoot);
  process.exit(1);
}

const mainActSrc = fs.readFileSync(mainActPath, "utf8");
const pkgMatch = mainActSrc.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
const pkgName = pkgMatch ? pkgMatch[1] : "com.teleclone.app";
const targetDir = path.dirname(mainActPath);

const customWebViewJava = `package ${pkgName};

import android.content.Context;
import android.text.InputType;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import com.getcapacitor.CapacitorWebView;

public class SuggestCapacitorWebView extends CapacitorWebView {
    public SuggestCapacitorWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection ic = super.onCreateInputConnection(outAttrs);
        if (outAttrs != null) {
            int inputClass = outAttrs.inputType & InputType.TYPE_MASK_CLASS;
            int variation = outAttrs.inputType & InputType.TYPE_MASK_VARIATION;
            boolean isSensitive =
                variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
                variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
                variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
                variation == InputType.TYPE_TEXT_VARIATION_URI;

            if (inputClass == InputType.TYPE_CLASS_TEXT && !isSensitive) {
                // Remove BOTH flags that make Android keyboards hide the suggestion strip in WebView
                outAttrs.inputType &= ~InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
                outAttrs.inputType &= ~InputType.TYPE_TEXT_FLAG_AUTO_COMPLETE;

                // Convert WEB_EDIT_TEXT to standard NORMAL text so all OEM keyboards show predictions
                if (variation == InputType.TYPE_TEXT_VARIATION_WEB_EDIT_TEXT) {
                    outAttrs.inputType &= ~InputType.TYPE_MASK_VARIATION;
                }

                outAttrs.inputType |= InputType.TYPE_TEXT_FLAG_AUTO_CORRECT;
                outAttrs.inputType |= InputType.TYPE_TEXT_FLAG_CAP_SENTENCES;

                // Allow personalized keyboard predictions
                outAttrs.imeOptions &= ~EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING;
            }
        }
        return ic;
    }
}
`;

fs.writeFileSync(path.join(targetDir, "SuggestCapacitorWebView.java"), customWebViewJava, "utf8");
console.log("OK: Updated SuggestCapacitorWebView.java (clears AUTO_COMPLETE + NO_SUGGESTIONS) in", pkgName);

const capLayoutDir = path.join("node_modules", "@capacitor", "android", "capacitor", "src", "main", "res", "layout");
const appLayoutDir = path.join("android", "app", "src", "main", "res", "layout");
fs.mkdirSync(appLayoutDir, { recursive: true });

let patchedCount = 0;

if (fs.existsSync(capLayoutDir)) {
  for (const file of fs.readdirSync(capLayoutDir)) {
    if (!file.endsWith(".xml")) continue;
    const srcXml = fs.readFileSync(path.join(capLayoutDir, file), "utf8");
    if (srcXml.includes("com.getcapacitor.CapacitorWebView")) {
      const updatedXml = srcXml.replace(
        /com\.getcapacitor\.CapacitorWebView/g,
        `${pkgName}.SuggestCapacitorWebView`
      );
      fs.writeFileSync(path.join(appLayoutDir, file), updatedXml, "utf8");
      console.log("OK: Overrode Capacitor layout XML:", file);
      patchedCount++;
    }
  }
}

for (const file of fs.readdirSync(appLayoutDir)) {
  if (!file.endsWith(".xml")) continue;
  const full = path.join(appLayoutDir, file);
  const xml = fs.readFileSync(full, "utf8");
  if (xml.includes("com.getcapacitor.CapacitorWebView")) {
    fs.writeFileSync(full, xml.replace(/com\.getcapacitor\.CapacitorWebView/g, `${pkgName}.SuggestCapacitorWebView`), "utf8");
    console.log("OK: Patched app layout XML:", file);
    patchedCount++;
  }
}

if (patchedCount === 0) {
  console.error("ERROR: Could not find CapacitorWebView layout XML");
  process.exit(1);
}
