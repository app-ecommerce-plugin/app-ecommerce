import React, { useEffect, useState } from "react";
import ProductSelector from "./ProductSelector";
import SelectedProducts from "./SelectedProducts";

function ProductManager() {
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [comparisonResults, setComparisonResults] = useState([]);

  useEffect(() => {
    async function fetchInitialSelection() {
      try {
        const res = await fetch("/products/selected", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        setSelectedProducts(data);
      } catch (err) {
        console.error("Error fetching initial selected products:", err);
      }
    }
    fetchInitialSelection();
  }, []);

  const handleSelectProducts = async (products) => {
    try {
      await fetch("/products/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(products),
      });
    } catch (err) {
      console.error("Error saving selected products:", err);
    }
    try {
      const res = await fetch("/products/selected", { credentials: "include" });
      const storeProducts = await res.json();
      setSelectedProducts(storeProducts);
    } catch (err) {
      console.error("Error fetching selected product details:", err);
    }
    setComparisonResults([]);
  };

  const handleCompare = async () => {
    try {
      const res = await fetch("/comparison", { credentials: "include" });
      if (!res.ok) {
        console.error("Comparison request failed:", res.statusText);
        return;
      }
      const results = await res.json();
      setComparisonResults(results);
    } catch (err) {
      console.error("Error fetching comparison results:", err);
    }
  };

  const handleRemoveProduct = async (productId) => {
    const updatedSelection = selectedProducts.filter((p) => p.id !== productId);
    setSelectedProducts(updatedSelection);
    setComparisonResults([]);
    try {
      const ids = updatedSelection.map((p) => p.id);
      await fetch("/products/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(ids),
      });
    } catch (err) {
      console.error("Error updating selected products:", err);
    }
  };

  return (
    <div>
      <ProductSelector onSelectProducts={handleSelectProducts} />
      <SelectedProducts
        selectedProducts={selectedProducts}
        comparisonResults={comparisonResults}
        onCompare={handleCompare}
        onRemoveProduct={handleRemoveProduct}
      />
    </div>
  );
}

export default ProductManager;
