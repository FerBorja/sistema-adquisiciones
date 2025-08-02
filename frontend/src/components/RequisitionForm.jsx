import { useState } from 'react';
import axios from 'axios';

export default function RequisitionForm() {
  const [form, setForm] = useState({
    project_name: '',
    income_source: '',
    contract: '',
    category: '',
    tender: '',
  });

  const [items, setItems] = useState([
    { item_name: '', unit_type: '', quantity: 1, unit_cost: 0 },
  ]);

  const token = localStorage.getItem('access'); // JWT token

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleItemChange = (index, e) => {
    const newItems = [...items];
    newItems[index][e.target.name] = e.target.value;
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { item_name: '', unit_type: '', quantity: 1, unit_cost: 0 }]);
  };

  const removeItem = (index) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = {
      ...form,
      items: items.map(item => ({
        ...item,
        quantity: parseInt(item.quantity),
        unit_cost: parseFloat(item.unit_cost),
      }))
    };

    try {
      await axios.post('http://localhost:8000/api/requisitions/', data, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      alert('Requisición creada exitosamente');
    } catch (err) {
      console.error(err);
      alert('Error al crear requisición');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Crear Requisición</h2>
      
      {['project_name', 'income_source', 'contract', 'category', 'tender'].map(field => (
        <div className="mb-3" key={field}>
          <label className="block capitalize">{field.replace('_', ' ')}</label>
          <input
            type="text"
            name={field}
            value={form[field]}
            onChange={handleChange}
            className="border rounded w-full p-2"
            required
          />
        </div>
      ))}

      <h3 className="text-lg font-semibold mt-4 mb-2">Ítems</h3>
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-4 gap-2 mb-2 items-center">
          <input type="text" name="item_name" placeholder="Nombre del ítem" className="border p-2" value={item.item_name} onChange={(e) => handleItemChange(index, e)} required />
          <input type="text" name="unit_type" placeholder="Unidad" className="border p-2" value={item.unit_type} onChange={(e) => handleItemChange(index, e)} required />
          <input type="number" name="quantity" placeholder="Cantidad" className="border p-2" value={item.quantity} onChange={(e) => handleItemChange(index, e)} required />
          <input type="number" name="unit_cost" placeholder="Costo unitario" className="border p-2" value={item.unit_cost} onChange={(e) => handleItemChange(index, e)} required />
          <button type="button" onClick={() => removeItem(index)} className="text-red-600 text-sm ml-2">Eliminar</button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="bg-blue-500 text-white px-3 py-1 rounded mb-4">Agregar Ítem</button>

      <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded">Enviar Requisición</button>
    </form>
  );
}
