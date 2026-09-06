/**
 * CreditOps → Credit Cases.
 *
 * The clients this organization is doing credit repair work for, with the
 * pipeline columns that question needs: lifecycle, processing status, round.
 * Opening one lands in the credit-repair application, which is correct here
 * and wrong on the canonical client record.
 */
import { LiveClientsList } from "@/components/clients/LiveClientsList";

const CreditCases = () => <LiveClientsList />;

export default CreditCases;
