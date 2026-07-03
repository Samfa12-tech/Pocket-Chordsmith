export type HiddenFileInputOptions = {
  accept: string;
  label: string;
  onChange: () => void;
};

export function configureHiddenFileInput(input: HTMLInputElement, options: HiddenFileInputOptions): HTMLInputElement {
  input.type = "file";
  input.accept = options.accept;
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  input.setAttribute("data-hidden-file-input", options.label);
  input.addEventListener("change", options.onChange);

  Object.assign(input.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    overflow: "hidden"
  });

  return input;
}
