namespace Library.Loans;

// What the API receives from the member app.
public class LoanRequest
{
    public string? MemberId { get; set; }
    public string? Barcode { get; set; }
}
