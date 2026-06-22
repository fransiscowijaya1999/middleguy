import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

/** After a successful add (pass `fetcher.state === "idle" && !!fetcher.data?.ok`),
 *  reset the form and refocus its first field so rows can be entered rapidly. */
export function useClearOnSuccess(succeeded: boolean) {
	const formRef = useRef<HTMLFormElement>(null);
	const focusRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (succeeded) {
			formRef.current?.reset();
			focusRef.current?.focus();
		}
	}, [succeeded]);
	return { formRef, focusRef };
}

/** Auto-save an editable row when a field changes and then loses focus.
 *  Wire `markDirty` to onChange and `saveIfDirty` to onBlur on the form. */
export function useAutosaveRow() {
	const fetcher = useFetcher();
	const formRef = useRef<HTMLFormElement>(null);
	const dirty = useRef(false);
	return {
		fetcher,
		formRef,
		markDirty: () => {
			dirty.current = true;
		},
		saveIfDirty: () => {
			if (dirty.current && formRef.current) {
				dirty.current = false;
				fetcher.submit(formRef.current, { method: "post" });
			}
		},
	};
}
