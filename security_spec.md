# Security Specification: AutoGarage Manager

## 1. Data Invariants
1. **User Isolation**: A user can only create, read, update, and delete vehicle records where `userId == request.auth.uid`.
2. **Subcollection Integrity**: A repair task or general expense must belong to a parent vehicle owned by the authenticated user (`vehicle.userId == request.auth.uid`).
3. **ID Sanitization**: Document IDs and route parameters must conform to `^[a-zA-Z0-9_\-]+$` and be within 128 characters.
4. **Financial Non-Negativity**: Vehicle purchase price, parts cost, labor cost, and expense amounts must be valid non-negative numbers.
5. **Ownership Immutability**: The `userId` of a vehicle and its sub-items cannot be altered after creation (`incoming().userId == existing().userId`).
6. **Strict Status Lifecycle**: Vehicle status must be strictly one of `['preparation', 'repair', 'for_sale', 'sold']`.
7. **Task Status Validation**: Repair task status must be one of `['todo', 'in_progress', 'done']`.
8. **Expense Category Validation**: General expense category must be one of `['transport', 'controle_technique', 'detailing', 'admin', 'insurance', 'other']`.

## 2. The Dirty Dozen Payloads (Targeting Exploits)
1. **Payload 1 (Identity Hijacking)**: Attacker crafts a vehicle record with `userId: "victim_uid"`.
2. **Payload 2 (Ghost Field Injection)**: Attacker injects unauthorized fields like `isAdmin: true` into a vehicle document.
3. **Payload 3 (Unauthenticated Read)**: Anonymous guest attempts to list vehicles from `/vehicles`.
4. **Payload 4 (Cross-Tenant List Scraping)**: User A attempts a list query on `/vehicles` without restricting `where("userId", "==", userA.uid)`.
5. **Payload 5 (Owner Mutation Attack)**: Existing vehicle owner attempts to change `userId` to transfer ownership illegitimately.
6. **Payload 6 (Orphaned Task Creation)**: Attacker attempts to create a repair task on a vehicle owned by another user.
7. **Payload 7 (Denial of Wallet String Bomb)**: Attacker submits a task description with a 500KB string payload.
8. **Payload 8 (Negative Financial Injection)**: Attacker inputs negative amounts (`partsCost: -99999`) to manipulate profit calculations.
9. **Payload 9 (Invalid Status Injection)**: Attacker sends vehicle status `status: "deleted_free"` bypassing workflow enums.
10. **Payload 10 (Path Traversal ID Poisoning)**: Attacker sends document ID with invalid characters or excessive length.
11. **Payload 11 (Cross-Tenant Expense Deletion)**: Attacker attempts to delete another user's general expense subcollection item.
12. **Payload 12 (Direct Buyer Overwrite on Active Vehicle)**: Attacker pushes buyer info updates without vehicle being marked as sold.

All 12 malicious payloads must be rejected with PERMISSION_DENIED.
