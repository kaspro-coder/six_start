from retrieval_engine import query_sixth_sense


def main():
    query = "How do we handle ESG-linked structured products?"
    results = query_sixth_sense(query)

    print(f"Query: {query}")
    print("\nOfficial rules:")
    for index, document in enumerate(results["official_rules"], start=1):
        print(f"\n[{index}]")
        print(document.page_content)
        print(f"Metadata: {document.metadata}")

    print("\nExpert workflow context:")
    for index, document in enumerate(results["expert_workflow_context"], start=1):
        print(f"\n[{index}]")
        print(document.page_content)
        print(f"Metadata: {document.metadata}")


if __name__ == "__main__":
    main()
