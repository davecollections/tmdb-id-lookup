const appModalStack = [];
const appModalReturnFocus = new Map();

function getAppModalElement(modal) {
	return typeof modal === "string" ? document.getElementById(modal) : modal;
}

function getAppModalFocusTarget(target) {
	if (!target) {
		return null;
	}

	return typeof target === "string" ? document.getElementById(target) : target;
}

function getAppModalFocusableElements(modal) {
	return Array.from(
		modal.querySelectorAll(
			'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
		),
	).filter((element) => element.offsetParent !== null);
}

function openAppModal(modal, focusTarget) {
	const modalElement = getAppModalElement(modal);

	if (!modalElement) {
		return;
	}

	if (!appModalReturnFocus.has(modalElement) && document.activeElement instanceof HTMLElement) {
		appModalReturnFocus.set(modalElement, document.activeElement);
	}

	modalElement.hidden = false;

	if (!appModalStack.includes(modalElement)) {
		appModalStack.push(modalElement);
	}

	requestAnimationFrame(() => {
		const targetElement = getAppModalFocusTarget(focusTarget);
		const fallbackElement = getAppModalFocusableElements(modalElement)[0];

		(targetElement || fallbackElement)?.focus();
	});
}

function closeAppModal(modal) {
	const modalElement = getAppModalElement(modal);

	if (!modalElement) {
		return;
	}

	modalElement.hidden = true;

	const stackIndex = appModalStack.indexOf(modalElement);

	if (stackIndex !== -1) {
		appModalStack.splice(stackIndex, 1);
	}

	const returnTarget = appModalReturnFocus.get(modalElement);
	appModalReturnFocus.delete(modalElement);

	if (!appModalStack.length && returnTarget instanceof HTMLElement && document.contains(returnTarget)) {
		returnTarget.focus();
	}
}

function getTopAppModal() {
	for (let index = appModalStack.length - 1; index >= 0; index -= 1) {
		const modal = appModalStack[index];

		if (modal && !modal.hidden) {
			return modal;
		}
	}

	return Array.from(document.querySelectorAll(".modal-backdrop:not([hidden])")).pop() || null;
}

function closeTopAppModal() {
	const modal = getTopAppModal();

	if (!modal) {
		return;
	}

	const closeButton = modal.querySelector(".modal-close");

	if (closeButton instanceof HTMLElement) {
		closeButton.click();
		return;
	}

	closeAppModal(modal);
}

function trapAppModalFocus(event, modal) {
	const focusableElements = getAppModalFocusableElements(modal);

	if (!focusableElements.length) {
		event.preventDefault();
		modal.focus();
		return;
	}

	const firstElement = focusableElements[0];
	const lastElement = focusableElements[focusableElements.length - 1];

	if (!modal.contains(document.activeElement)) {
		event.preventDefault();
		firstElement.focus();
		return;
	}

	if (event.shiftKey && document.activeElement === firstElement) {
		event.preventDefault();
		lastElement.focus();
	}

	if (!event.shiftKey && document.activeElement === lastElement) {
		event.preventDefault();
		firstElement.focus();
	}
}

function initAppModalSystem() {
	if (window.appModalSystemInitialized) {
		return;
	}

	window.appModalSystemInitialized = true;

	document.addEventListener("keydown", (event) => {
		const modal = getTopAppModal();

		if (!modal) {
			return;
		}

		if (event.key === "Escape") {
			event.preventDefault();
			closeTopAppModal();
			return;
		}

		if (event.key === "Tab") {
			trapAppModalFocus(event, modal);
		}
	});
}

window.openAppModal = openAppModal;
window.closeAppModal = closeAppModal;
window.initAppModalSystem = initAppModalSystem;
