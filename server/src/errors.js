/** A sale can't go through (e.g. not enough stock). The message is safe to show to the shop owner. */
export class SaleError extends Error {}
/** Another item with the same name and size already exists. */
export class ConflictError extends Error {}
