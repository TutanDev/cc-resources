using Library.Catalog;
using Library.Loans;
using Library.Members;

namespace Library.Data;

public interface ILibraryStore
{
    Task<Member?> FindMember(string memberId);
    Task<Copy?> FindCopy(string barcode);
    Task<int> CountActiveLoans(string memberId);

    // Records the loan and marks its copy as on loan.
    Task SaveLoan(Loan loan);
}
