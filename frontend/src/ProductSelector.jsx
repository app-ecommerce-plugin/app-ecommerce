import React, { useState } from "react";

function ProductSelector({ onSelectProducts }) {
  // Este es un botón de prueba; en producción deberías conectar con Shopify ResourcePicker
  return (
    <button
      onClick={() => {
        // Simula selección de productos
        const productosFicticios = [
          { id: 1, title: 'Samsung TV Neo QLED 4K 75" TQ75QN85DBTXXC' },
          { id: 3, title: "Horno multifunción AEG pirolítico" },
        ];
        onSelectProducts(productosFicticios);
      }}
    >
      Seleccionar productos de prueba
    </button>
  );
}

export default ProductSelector;
