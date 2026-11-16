namespace Library.Catalog;

public class Copy
{
    public string Barcode { get; set; } = "";
    public string Title { get; set; } = "";
    public bool IsReferenceOnly { get; set; }
    public bool IsNewRelease { get; set; }
    public bool IsOnLoan { get; set; }
}
