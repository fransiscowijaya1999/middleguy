import { useEffect, useRef } from "react";

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
