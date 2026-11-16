namespace Library.Loans;

public class Loan
{
    public Guid Id { get; set; }
    public string MemberId { get; set; } = "";
    public string Barcode { get; set; } = "";
    public DateTime LentOn { get; set; }
    public DateTime DueOn { get; set; }
}
